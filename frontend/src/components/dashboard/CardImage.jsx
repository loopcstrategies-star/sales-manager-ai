import React, { useState } from 'react'

export default function CardImage({ src, className }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
