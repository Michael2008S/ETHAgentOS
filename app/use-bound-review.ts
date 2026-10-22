'use client';
import { useState } from 'react';

/** A review is invalid as soon as any of the reviewed commitments changes. */
export function useBoundReview(binding: string): [boolean, (reviewed: boolean) => void] {
  const [review, setReview] = useState({ binding, reviewed: false });
  if (review.binding !== binding) setReview({ binding, reviewed: false });
  return [review.binding === binding && review.reviewed, reviewed => setReview({ binding, reviewed })];
}
