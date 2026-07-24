// Custo real por sessão, parseado dos JSONL (modelo ccusage). Claude e Codex
// já gravam tokens por mensagem nos arquivos de sessão; aqui somamos e
// multiplicamos por uma tabela de preço por modelo. Diferente de
// claude_usage.rs/codex_usage.rs, que só expõem utilização (%) da conta.
//
// Fluxo: o front resolve ptyId -> session_id (via snapshot_* pós-spawn) e chama
// get_session_cost(agent, cwd, session_id) periodicamente pro Token HUD.

use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

/// Preço por 1M de tokens (USD). Cache write 5m = 1.25× input, 1h = 2× input,
/// cache read = 0.1× input — multiplicadores padrão do prompt caching da
/// Anthropic. Validado via skill claude-api (tabela de modelos atual).
struct Pricing {
    input: f64,
    output: f64,
    cache_write_5m: f64,
    cache_write_1h: f64,
    cache_read: f64,
}

/// Banco SQLite do OpenCode CLI (tokens/custo por sessão). Windows/macOS usam
/// data_dir; Linux usa data_local_dir.
fn opencode_db_path() -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        dirs_next::data_local_dir().map(|d| d.join("opencode").join("opencode.db"))
    }
    #[cfg(not(target_os = "linux"))]
    {
        dirs_next::data_dir().map(|d| d.join("opencode").join("opencode.db"))
    }
}

/// Resolve o preço por prefixo do model id (ex.: "claude-opus-4-8",
/// "claude-sonnet-4-6", "claude-haiku-4-5"). Codex usa modelos GPT, sem preço
/// público estável aqui — retorna None (tokens ainda somam, custo fica null).
fn pricing_for(model: &str) -> Option<Pricing> {
    let m = model.to_ascii_lowercase();

    // Modelos de precificação conhecidos do OpenCode (valores por 1M tokens).
    if m.contains("deepseek-v4-pro") {
        return Some(Pricing {
            input: 1.74,
            output: 3.48,
            cache_write_5m: 0.0,
            cache_write_1h: 0.0,
            cache_read: 0.0145,
        });
    }
    if m.contains("qwen3.7-max") {
        return Some(Pricing {
            input: 2.50,
            output: 7.50,
            cache_write_5m: 3.125,
            cache_write_1h: 3.125,
            cache_read: 0.50,
        });
    }
    if m.contains("glm-5.2") {
        return Some(Pricing {
            input: 1.40,
            output: 4.40,
            cache_write_5m: 0.0,
            cache_write_1h: 0.0,
            cache_read: 0.26,
        });
    }
    if m.contains("kimi-k2.7-code") {
        return Some(Pricing {
            input: 0.95,
            output: 4.00,
            cache_write_5m: 0.0,
            cache_write_1h: 0.0,
            cache_read: 0.19,
        });
    }
    if m.contains("deepseek-v4-flash-free") {
        return Some(Pricing {
            input: 0.0,
            output: 0.0,
            cache_write_5m: 0.0,
            cache_write_1h: 0.0,
            cache_read: 0.0,
        });
    }
    if m.contains("minimax-m3") {
        return Some(Pricing {
            input: 0.55,
            output: 2.19,
            cache_write_5m: 0.0,
            cache_write_1h: 0.0,
            cache_read: 0.055,
        });
    }

    // input, output → derivados: 5m=1.25x, 1h=2x, read=0.1x
    let base = if m.contains("opus") {
        (5.0, 25.0)
    } else if m.contains("sonnet") {
        (3.0, 15.0)
    } else if m.contains("haiku") {
        (1.0, 5.0)
    } else {
        return None;
    };
    let (input, output) = base;
    Some(Pricing {
        input,
        output,
        cache_write_5m: input * 1.25,
        cache_write_1h: input * 2.0,
        cache_read: input * 0.1,
    })
}

#[derive(Serialize, Default, Clone)]
pub struct ModelCost {
    pub model: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write_5m: u64,
    pub cache_write_1h: u64,
    /// Custo em USD desse modelo, ou None se o modelo não está na tabela.
    pub cost_usd: Option<f64>,
}

#[derive(Serialize, Default)]
pub struct SessionCost {
    pub session_id: String,
    pub agent: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write_5m: u64,
    pub cache_write_1h: u64,
    pub total_tokens: u64,
    /// Soma dos custos por modelo conhecidos. None se nenhum modelo tinha preço.
    pub cost_usd: Option<f64>,
    /// Modelo dominante (mais output) — pro HUD mostrar um label.
    pub model: Option<String>,
    pub by_model: Vec<ModelCost>,
}

impl ModelCost {
    fn compute_cost(&mut self) {
        if let Some(p) = pricing_for(&self.model) {
            let cost = self.input as f64 / 1_000_000.0 * p.input
                + self.output as f64 / 1_000_000.0 * p.output
                + self.cache_read as f64 / 1_000_000.0 * p.cache_read
                + self.cache_write_5m as f64 / 1_000_000.0 * p.cache_write_5m
                + self.cache_write_1h as f64 / 1_000_000.0 * p.cache_write_1h;
            self.cost_usd = Some(cost);
        }
    }
}

/// Parser do JSONL do Claude: soma message.usage por linha assistant,
/// agrupando por message.model.
fn parse_claude_cost(path: &PathBuf) -> std::collections::HashMap<String, ModelCost> {
    let mut by_model: std::collections::HashMap<String, ModelCost> = std::collections::HashMap::new();
    let Ok(file) = fs::File::open(path) else {
        return by_model;
    };
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let Some(message) = value.get("message") else {
            continue;
        };
        let Some(usage) = message.get("usage") else {
            continue;
        };
        let model = message
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let entry = by_model.entry(model.clone()).or_insert_with(|| ModelCost {
            model,
            ..Default::default()
        });
        let u = |k: &str| usage.get(k).and_then(|v| v.as_u64()).unwrap_or(0);
        entry.input += u("input_tokens");
        entry.output += u("output_tokens");
        entry.cache_read += u("cache_read_input_tokens");
        // Breakdown 5m/1h vem em cache_creation; fallback p/ cache_creation_input_tokens como 5m.
        let cc = usage.get("cache_creation");
        let cc5 = cc
            .and_then(|c| c.get("ephemeral_5m_input_tokens"))
            .and_then(|v| v.as_u64());
        let cc1 = cc
            .and_then(|c| c.get("ephemeral_1h_input_tokens"))
            .and_then(|v| v.as_u64());
        match (cc5, cc1) {
            (Some(a), Some(b)) => {
                entry.cache_write_5m += a;
                entry.cache_write_1h += b;
            }
            _ => {
                entry.cache_write_5m += u("cache_creation_input_tokens");
            }
        }
    }
    by_model
}

/// Parser do rollout JSONL do Codex: pega o ÚLTIMO event_msg token_count
/// (info.total_token_usage é cumulativo).
fn parse_codex_cost(path: &PathBuf) -> ModelCost {
    let mut cost = ModelCost {
        model: "codex".to_string(),
        ..Default::default()
    };
    let Ok(file) = fs::File::open(path) else {
        return cost;
    };
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let payload = value.get("payload");
        let is_token_count = payload
            .and_then(|p| p.get("type"))
            .and_then(|v| v.as_str())
            == Some("token_count");
        if !is_token_count {
            continue;
        }
        let Some(total) = payload
            .and_then(|p| p.get("info"))
            .and_then(|i| i.get("total_token_usage"))
        else {
            continue;
        };
        let u = |k: &str| total.get(k).and_then(|v| v.as_u64()).unwrap_or(0);
        // total_* é cumulativo → sobrescreve (último vence).
        cost.input = u("input_tokens");
        cost.output = u("output_tokens");
        cost.cache_read = u("cached_input_tokens");
    }
    cost
}

/// Acha o arquivo de rollout do Codex cujo session_meta.id == session_id.
fn find_codex_session_path(session_id: &str) -> Option<PathBuf> {
    let root = crate::codex_sessions::codex_sessions_dir()?;
    if !root.is_dir() {
        return None;
    }
    let mut files = Vec::new();
    crate::codex_sessions::collect_jsonl_files(&root, &mut files);
    for path in files {
        if let Some(id) = crate::codex_sessions::session_meta_id(&path) {
            if id == session_id {
                return Some(path);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn get_session_cost(
    agent: String,
    cwd: String,
    session_id: String,
) -> Result<SessionCost, String> {
    // Parse de JSONL é IO/CPU pesado e é pollado a cada 4s no canvas → spawn_blocking
    // pra não bloquear a thread principal do Tauri (UI travaria).
    tokio::task::spawn_blocking(move || get_session_cost_inner(agent, cwd, session_id))
        .await
        .map_err(|e| e.to_string())?
}

fn get_session_cost_inner(
    agent: String,
    cwd: String,
    session_id: String,
) -> Result<SessionCost, String> {
    let by_model: Vec<ModelCost> = match agent.as_str() {
        "codex" => {
            let Some(path) = find_codex_session_path(&session_id) else {
                return Err(format!("sessão codex {session_id} não encontrada"));
            };
            vec![parse_codex_cost(&path)]
        }
        "claude" => {
            let dirs = crate::claude_sessions::project_dirs_for_cwd(&cwd)?;
            let mut path: Option<PathBuf> = None;
            for dir in dirs {
                let candidate = dir.join(format!("{session_id}.jsonl"));
                if candidate.is_file() {
                    path = Some(candidate);
                    break;
                }
            }
            let Some(path) = path else {
                return Err(format!("sessão claude {session_id} não encontrada"));
            };
            parse_claude_cost(&path).into_values().collect()
        }
        "opencode" => {
            let db_path = opencode_db_path()
                .ok_or_else(|| "caminho do banco do OpenCode não encontrado".to_string())?;
            if !db_path.is_file() {
                return Err(format!("banco do OpenCode não encontrado em: {db_path:?}"));
            }

            let conn = rusqlite::Connection::open_with_flags(
                &db_path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )
            .map_err(|e| format!("falha ao abrir banco do OpenCode: {e}"))?;

            let mut stmt = conn
                .prepare(
                    "SELECT model, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write FROM session WHERE id = ?1",
                )
                .map_err(|e| format!("falha ao preparar query: {e}"))?;

            let mut rows = stmt
                .query(rusqlite::params![session_id])
                .map_err(|e| format!("falha ao executar query: {e}"))?;

            let mut result_by_model = Vec::new();
            if let Some(row) = rows.next().map_err(|e| format!("falha ao ler linha: {e}"))? {
                let model_raw: String = row.get(0).unwrap_or_default();
                let tokens_input: u64 = row.get(1).unwrap_or(0);
                let tokens_output: u64 = row.get(2).unwrap_or(0);
                let tokens_cache_read: u64 = row.get(3).unwrap_or(0);
                let tokens_cache_write: u64 = row.get(4).unwrap_or(0);

                // A coluna `model` pode ser JSON ({"id": "..."}) ou string simples.
                let model_name = if let Ok(v) = serde_json::from_str::<serde_json::Value>(&model_raw) {
                    v.get("id")
                        .and_then(|id| id.as_str())
                        .unwrap_or(&model_raw)
                        .to_string()
                } else {
                    model_raw
                };

                result_by_model.push(ModelCost {
                    model: model_name,
                    input: tokens_input,
                    output: tokens_output,
                    cache_read: tokens_cache_read,
                    cache_write_5m: tokens_cache_write,
                    ..Default::default()
                });
            }
            result_by_model
        }
        other => return Err(format!("agente sem custo suportado: {other}")),
    };

    Ok(aggregate(agent, session_id, by_model))
}

/// Custo direto de um transcript JSONL do Claude por path absoluto — usado pelos
/// nós do agent canvas (cada subagent/teammate tem `agent_transcript_path`).
/// Mesmo formato/parses do Claude; só não precisa resolver cwd+session_id.
#[tauri::command]
pub async fn get_transcript_cost(path: String) -> Result<SessionCost, String> {
    tokio::task::spawn_blocking(move || get_transcript_cost_inner(path))
        .await
        .map_err(|e| e.to_string())?
}

fn get_transcript_cost_inner(path: String) -> Result<SessionCost, String> {
    let pb = PathBuf::from(&path);
    if !pb.is_file() {
        return Err(format!("transcript não encontrado: {path}"));
    }
    let by_model: Vec<ModelCost> = parse_claude_cost(&pb).into_values().collect();
    Ok(aggregate("claude".to_string(), path, by_model))
}

/// Soma o breakdown por modelo num total de sessão (computa custo, escolhe o
/// modelo dominante por output). Compartilhado por get_session_cost e
/// get_transcript_cost — fonte única da agregação e da tabela de preço.
fn aggregate(agent: String, session_id: String, mut by_model: Vec<ModelCost>) -> SessionCost {
    for mc in &mut by_model {
        mc.compute_cost();
    }

    let mut total = SessionCost {
        session_id,
        agent,
        ..Default::default()
    };
    let mut any_cost = false;
    let mut dominant: Option<(u64, String)> = None;
    for mc in &by_model {
        total.input += mc.input;
        total.output += mc.output;
        total.cache_read += mc.cache_read;
        total.cache_write_5m += mc.cache_write_5m;
        total.cache_write_1h += mc.cache_write_1h;
        if let Some(c) = mc.cost_usd {
            any_cost = true;
            total.cost_usd = Some(total.cost_usd.unwrap_or(0.0) + c);
        }
        let by_output = dominant.as_ref().map(|(o, _)| mc.output > *o).unwrap_or(true);
        if by_output {
            dominant = Some((mc.output, mc.model.clone()));
        }
    }
    if !any_cost {
        total.cost_usd = None;
    }
    total.total_tokens =
        total.input + total.output + total.cache_read + total.cache_write_5m + total.cache_write_1h;
    total.model = dominant.map(|(_, m)| m);
    total.by_model = by_model;
    total
}

/// Preço por 1M de tokens, por família de modelo — exposto pro front estimar a
/// "economia por roteamento" (custo hipotético no modelo do lead vs. real). Mesma
/// tabela de `pricing_for`, sem duplicar números.
#[derive(Serialize)]
pub struct ModelRate {
    pub family: String,
    pub input: f64,
    pub output: f64,
    pub cache_write_5m: f64,
    pub cache_write_1h: f64,
    pub cache_read: f64,
}

#[tauri::command]
pub fn get_model_pricing() -> Vec<ModelRate> {
    ["opus", "sonnet", "haiku"]
        .iter()
        .filter_map(|family| {
            pricing_for(family).map(|p| ModelRate {
                family: (*family).to_string(),
                input: p.input,
                output: p.output,
                cache_write_5m: p.cache_write_5m,
                cache_write_1h: p.cache_write_1h,
                cache_read: p.cache_read,
            })
        })
        .collect()
}
