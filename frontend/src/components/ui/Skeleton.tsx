import { cn } from '../../lib/cn';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  className?: string;
}

export function Skeleton({ width, height, circle, className }: SkeletonProps) {
  const w = typeof width === 'number' ? `${width}px` : width;
  const h = typeof height === 'number' ? `${height}px` : height;
  return (
    <div
      className={cn('skeleton', circle && 'rounded-full', className)}
      style={{ width: w, height: h }}
      aria-hidden
    />
  );
}
