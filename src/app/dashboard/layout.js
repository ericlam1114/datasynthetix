'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import RouteGuard from '../../components/auth/route-guard';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { 
  Database, Home, Upload, FileText, Settings, 
  User, LogOut, Bell, Search, CreditCard, FolderClosed, Code, ShieldAlert
} from 'lucide-react';

export default function DashboardLayout({ children }) {
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
    {
      href: `/dashboard`,
      label: "Overview",
      icon: Home,
    },
    {
      href: `/dashboard/upload`,
      label: "Upload",
      icon: Upload,
    },
    {
      href: `/dashboard/documents`,
      label: "My Documents",
      icon: FolderClosed,
    },
    {
      href: `/dashboard/datasets`,
      label: "Datasets",
      icon: Database,
    },
    {
      href: `/dashboard/credits`,
      label: "Credits",
      icon: CreditCard,
    },
    {
      href: `/dashboard/api-test`,
      label: "API Testing",
      icon: Code,
    },
    {
      href: `/dashboard/firebase-auth-test`,
      label: "Auth Test",
      icon: ShieldAlert,
    },
    {
      href: `/dashboard/settings`,
      label: "Settings",
      icon: Settings,
    },
  ];

  return (
    <RouteGuard>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-md hidden md:block">
          <div className="p-6 flex items-center space-x-2">
            <Database className="h-6 w-6 text-indigo-600" />
            <span className="text-xl font-bold">data synthetix</span>
          </div>
          
          <nav className="mt-6">
            <ul className="space-y-1 px-3">
              {routes.map((route) => {
                const Icon = route.icon;
                const isActive = pathname === route.href;
                
                return (
                  <li key={route.href}>
                    <Link
                      href={route.href}
                      className={`flex items-center px-4 py-3 text-sm rounded-md transition-colors ${
                        isActive 
                          ? 'bg-indigo-50 text-indigo-700 font-medium' 
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      {route.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="h-16 bg-white border-b flex items-center justify-between px-6">
            <div className="md:hidden flex items-center">
              <Database className="h-6 w-6 text-indigo-600" />
              <span className="text-xl font-bold ml-2">data synthetix</span>
            </div>
            
            <div className="md:flex items-center hidden">
              <div className="relative w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search..."
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
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
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
    </RouteGuard>
  );
}