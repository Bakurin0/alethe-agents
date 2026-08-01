import { useState } from 'react'

/**
 * Avatar com fallback: mostra a imagem quando `src` carrega, senão a inicial.
 * Se a imagem falhar em runtime (onError), cai pra inicial. `className` é
 * aplicado tanto no <img> quanto no <span> de fallback pra manter o mesmo
 * tamanho/estilo (defina o layout no .module.css do chamador).
 *
 * Centraliza o padrão img+onError+inicial antes duplicado em UserProfile e
 * HomeView.
 */
export function Avatar({
  src,
  initial,
  className,
  alt = '',
}: {
  src: string | null
  initial: string
  className?: string
  alt?: string
}) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        draggable={false}
        onError={() => setFailed(true)}
      />
    )
  }
  return <span className={className}>{initial}</span>
}
