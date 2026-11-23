import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<'img'>, 'width' | 'height' | 'alt' | 'loading'> & {
  /** Intrinsic size: always set, so the image never shifts the layout. */
  width: number
  height: number
  /** What the image shows, or "" when it is decorative. */
  alt: string
  /** AVIF and WebP versions, best first. The `src` is the fallback. */
  sources?: Array<{ srcSet: string; type: 'image/avif' | 'image/webp'; sizes?: string }>
  /** The page's LCP image only: fetched early at high priority instead of lazily. */
  priority?: boolean
}

/** The image default: modern formats, a fixed size, lazy and async unless it is the LCP image. */
export function ResponsiveImage({ sources = [], priority = false, alt, className, ...img }: Props) {
  return (
    <picture>
      {sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={s.sizes ?? img.sizes} />
      ))}
      <img
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'auto' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={className ?? 'h-auto max-w-full'}
        {...img}
      />
    </picture>
  )
}
