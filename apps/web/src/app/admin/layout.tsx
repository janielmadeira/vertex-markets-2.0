'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Loader2 } from 'lucide-react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const user    = useAuthStore(s => s.user)
  const loading = useAuthStore(s => s.loading)

  const [adminCheck, setAdminCheck] = useState<'checking' | 'allowed' | 'denied'>('checking')

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }

    let cancelled = false
    supabase.rpc('is_admin', { uid: user.id }).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setAdminCheck('denied')
        router.replace('/')
      } else {
        setAdminCheck('allowed')
      }
    })
    return () => { cancelled = true }
  }, [user, loading, router])

  if (loading || adminCheck === 'checking') {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <Loader2 className="animate-spin text-green-400" size={32} />
      </div>
    )
  }

  if (adminCheck !== 'allowed') return null

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
