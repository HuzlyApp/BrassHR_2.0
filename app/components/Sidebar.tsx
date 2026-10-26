'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const menuItems = [
  { icon: '🏠', label: 'Dashboard', href: '/admin_recruiter/home' },
  // { icon: '👥', label: 'Candidates', href: '/admin_recruiter/candidates' },
  { icon: '👥', label: 'Applicants', href: '/admin_recruiter/applications' },
  { icon: '🆕', label: 'New', href: '/admin_recruiter/new' },
  { icon: '⏳', label: 'Pending', href: '/admin_recruiter/pending' },
  { icon: '✅', label: 'Approved', href: '/admin_recruiter/approved' },
  { icon: '👷', label: 'Workers', href: '/admin_recruiter/workers' },
  { icon: '📅', label: 'Schedule', href: '/admin_recruiter/schedule' },
  { icon: '📋', label: 'Applications', href: '/admin_recruiter/applications' },
  { icon: '🛎️', label: 'Notifications', href: '/admin_recruiter/notifications' },
  { icon: '🎯', label: 'Skills', href: '/admin_recruiter/skills' },
  { icon: '⚙️', label: 'Settings', href: '/admin_recruiter/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="fixed left-0 top-0 h-screen w-20 bg-[#0A1F2F] flex flex-col items-center py-8 border-r border-[#1E3A5F]">
      <div className="mb-12">
        <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-cyan-400 rounded-2xl flex items-center justify-center">
          <span className="text-white text-2xl font-black">✕</span>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all hover:bg-[#1E3A5F] group relative ${isActive ? 'bg-[#1E3A5F]' : ''}`}
            >
              <span className="text-2xl text-white/80 group-hover:text-white">{item.icon}</span>
              <div className="absolute left-full ml-4 px-3 py-1.5 bg-[#1E3A5F] text-white text-sm rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 whitespace-nowrap z-50">
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto mb-8">
        <div className="w-12 h-12 flex items-center justify-center rounded-2xl hover:bg-[#1E3A5F] cursor-pointer">
          <span className="text-2xl text-white/70">↪️</span>
        </div>
      </div>
    </div>
  );
}