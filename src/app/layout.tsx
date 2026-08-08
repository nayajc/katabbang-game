import type { Metadata, Viewport } from 'next';
import './globals.css';

// Set NEXT_PUBLIC_SITE_URL on Vercel so OG/canonical URLs are absolute.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: '어깨빵 응징 러너',
  description: '어깨빵 시전자를 슬로우모션 타이밍 반격으로 응징하는 3레인 러너 게임.',
  openGraph: {
    title: '어깨빵 응징 러너',
    description: '어깨빵 시전자를 응징하라. 정의구현!',
    siteName: '어깨빵 응징 러너',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '어깨빵 응징 러너',
    description: '어깨빵 시전자를 응징하라. 정의구현!',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0b0d17',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
