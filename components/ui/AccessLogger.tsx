'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logAccess } from '@/lib/db/access-logs';

export default function AccessLogger() {
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    logAccess(supabase, pathname);
  }, [pathname]);

  return null;
}
