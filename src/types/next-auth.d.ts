// NextAuth v5 module augmentation — adds custom session/JWT fields
import 'next-auth';
import 'next-auth/jwt';
import type { UserRole } from '@/types/domain';

declare module 'next-auth' {
  interface User {
    id: string;
    name?: string | null;
    role: UserRole;
    hospitalCode: string;
    hospitalName: string;
    tunnelUrl: string;
    databaseType: string;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: UserRole;
      hospitalCode: string;
      hospitalName: string;
      tunnelUrl: string;
      databaseType: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: UserRole;
    hospitalCode: string;
    hospitalName: string;
    tunnelUrl: string;
    databaseType: string;
  }
}
