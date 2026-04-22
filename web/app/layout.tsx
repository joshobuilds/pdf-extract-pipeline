import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PDF Extract — Schema-driven PDF to JSON + Excel',
  description: 'Drop in a PDF, define the fields you want, get JSON and Excel back. Powered by Gemini 2.5 Flash.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
