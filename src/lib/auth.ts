// T085: NextAuth.js v5 configuration with BMS Session auth
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { validateBmsSession } from '@/lib/auth-utils';

export { mapPositionToRole, validateBmsSession } from '@/lib/auth-utils';
export type { BmsUserIdentity } from '@/lib/auth-utils';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'BMS Session',
      credentials: {
        sessionId: { label: 'BMS Session ID', type: 'text' },
      },
      async authorize(credentials) {
        const sessionId = credentials?.sessionId as string;
        if (!sessionId) return null;

        const tunnelUrl = process.env.DEV_HOSPITAL_TUNNEL_URL ?? '';
        const identity = await validateBmsSession(sessionId, tunnelUrl);
        if (!identity) return null;

        return {
          id: sessionId,
          name: identity.name,
          role: identity.role,
          hospitalCode: identity.hospitalCode,
          hospitalName: identity.hospitalName,
          tunnelUrl: identity.tunnelUrl,
          databaseType: identity.databaseType,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.hospitalCode = user.hospitalCode;
        token.hospitalName = user.hospitalName;
        token.tunnelUrl = user.tunnelUrl;
        token.databaseType = user.databaseType;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.hospitalCode = token.hospitalCode;
        session.user.hospitalName = token.hospitalName;
        session.user.tunnelUrl = token.tunnelUrl;
        session.user.databaseType = token.databaseType;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
});
