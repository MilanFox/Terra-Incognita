import type { UIButtonColor } from '@atoms/UIButton/UIButton.types';

export interface CardProps {
  title?: string
  description?: string
  color?: UIButtonColor
  link?: {
    text: string
    to: string
  }
  img: string
}
