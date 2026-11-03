// src/components/auth/LoginHero.tsx
// Decorative right-hand panel of the approved direction-C login. Hidden below
// md (864px) so the form leads on tablets/phones.
import Image from 'next/image';
import { HeartPulse } from 'lucide-react';
import { HERO_ILLUSTRATION_SRC, illustrationsEnabled } from '@/config/illustrations';

export function LoginHero() {
  return (
    <div aria-hidden="true" className="relative hidden min-h-screen bg-surface-muted md:block">
      {illustrationsEnabled() ? (
        <Image
          src={HERO_ILLUSTRATION_SRC.loginHero}
          alt=""
          fill
          priority
          sizes="(min-width: 864px) 55vw, 1px"
          className="object-cover"
        />
      ) : (
        <div className="grid h-full place-items-center bg-brand-soft">
          <HeartPulse className="h-24 w-24 text-brand" />
        </div>
      )}
    </div>
  );
}
