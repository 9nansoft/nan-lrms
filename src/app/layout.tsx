// Root layout — self-hosted Sarabun & JetBrains Mono fonts, SWR provider, Thai locale, TooltipProvider
import type { Metadata, Viewport } from 'next';
import '@fontsource/sarabun/300.css';
import '@fontsource/sarabun/400.css';
import '@fontsource/sarabun/500.css';
import '@fontsource/sarabun/600.css';
import '@fontsource/sarabun/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SWRProvider } from './swr-provider';
import { BuildBadge } from '@/components/shared/BuildBadge';
import './globals.css';

export const metadata: Metadata = {
  title: 'NN-LRMS — ระบบติดตามการคลอดจังหวัดน่าน',
  description: 'ระบบติดตามการคลอดแบบรวมศูนย์ จังหวัดน่าน (Nan Labor Room Monitoring System)',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="font-sans antialiased">
        <SWRProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </SWRProvider>
        <BuildBadge />
      </body>
    </html>
  );
}
