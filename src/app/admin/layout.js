// Create this file at: src/app/admin/layout.js

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminGuard from '@/components/auth/admin-guard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Database, Home, Users, CreditCard, Settings, 
  User, LogOut, Bell, Search, Shield, FileText 
} from 'lucide-react';

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };
  
  const routes = [
    { path: '/admin', label: 'Admin Dashboard', icon: Shield },
    { path: '/admin/users', label: 'User Management', icon: Users },
    { path: '/admin/credits', label: 'Credit Management', icon: CreditCard },
    { path: '/admin/datasets', label: 'All Datasets', icon: FileText },
    { path: '/admin/settings', label: 'System Settings', icon: Settings },
  ];

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-md hidden md:block">
          <div className="p-6 flex items-center space-x-2">
            <Shield className="h-6 w-6 text-red-600" />
            <span className="text-xl font-bold">Admin Panel</span>
          </div>
          
          <nav className="mt-6">
            <ul className="space-y-1 px-3">
              {routes.map((route) => {
                const Icon = route.icon;
                const isActive = pathname === route.path;
                
                return (
                  <li key={route.path}>
                    <Link
                      href={route.path}
                      className={`flex items-center px-4 py-3 text-sm rounded-md transition-colors ${
                        isActive 
                          ? 'bg-red-50 text-red-700 font-medium' 
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      {route.label}
                    </Link>
                  </li>
                );
              })}
              
              <li className="mt-8">
                <Link
                  href="/dashboard"
                  className="flex items-center px-4 py-3 text-sm rounded-md transition-colors text-gray-700 hover:bg-gray-100"
                >
                  <Home className="h-5 w-5 mr-3" />
                  Return to Dashboard
                </Link>
              </li>
            </ul>
          </nav>
        </aside>
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="h-16 bg-white border-b flex items-center justify-between px-6">
            <div className="md:hidden flex items-center">
              <Shield className="h-6 w-6 text-red-600" />
              <span className="text-xl font-bold ml-2">Admin Panel</span>
            </div>
            
            <div className="md:flex items-center hidden">
              <div className="relative w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search users..."
                  className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon" className="rounded-full">
                <Bell className="h-5 w-5" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Admin Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          
          {/* Content */}
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </AdminGuard>
  );
}