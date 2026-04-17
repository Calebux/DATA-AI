import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import Navbar from '@/components/layout/Navbar'

export const metadata: Metadata = {
  title: 'DATA-AI — Agent Workflow Automation',
  description: 'Automate complex business workflows with AI agent swarms. No code required.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full font-sans antialiased">
        <AuthProvider>
          <div className="flex flex-col min-h-full">
            <Navbar />
            <main className="flex-1 pt-14">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
