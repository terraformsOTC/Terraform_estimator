'use client';

import { MoneySwordProvider } from '@/contexts/MoneySword';

export default function ClientProviders({ children }) {
  return <MoneySwordProvider>{children}</MoneySwordProvider>;
}
