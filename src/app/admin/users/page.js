// Create this file at: src/app/admin/users/page.js

"use client";

import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setDoc, serverTimestamp } from "firebase/firestore";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search,
  RefreshCw,
  CreditCard,
  Edit,
  Trash2,
  Shield,
} from "lucide-react";

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [creditAmount, setCreditAmount] = useState("1000");
  const [selectedRole, setSelectedRole] = useState("user");

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const lowercaseQuery = searchQuery.toLowerCase();
      const filtered = users.filter(
        (user) =>
          (user.name && user.name.toLowerCase().includes(lowercaseQuery)) ||
          (user.email && user.email.toLowerCase().includes(lowercaseQuery))
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [searchQuery, users]);

  async function fetchUsers() {
    try {
      setLoading(true);

      const usersQuery = query(
        collection(firestore, "users"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(usersQuery);
      const usersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setUsers(usersData);
      setFilteredUsers(usersData);
      setError(null);
    } catch (error) {
      console.error("Error fetching users:", error);
      setError("Failed to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCredits() {
    if (!selectedUser) return;

    try {
      const userRef = doc(firestore, "users", selectedUser.id);
      const amount = parseInt(creditAmount);

      if (isNaN(amount) || amount <= 0) {
        setError("Please enter a valid amount");
        return;
      }

      await updateDoc(userRef, {
        credits: (selectedUser.credits || 0) + amount,
      });

      // Add credit history entry
      const historyRef = doc(collection(firestore, "creditHistory"));
      await setDoc(historyRef, {
        userId: selectedUser.id,
        amount: amount,
        type: "admin-add",
        description: `Admin added ${amount} credits`,
        timestamp: serverTimestamp(),
      });

      // Update local state
      setUsers(
        users.map((user) => {
          if (user.id === selectedUser.id) {
            return {
              ...user,
              credits: (user.credits || 0) + amount,
            };
          }
          return user;
        })
      );

      setSelectedUser(null);
    } catch (error) {
      console.error("Error adding credits:", error);
      setError("Failed to add credits. Please try again.");
    }
  }

  async function handleChangeRole() {
    if (!selectedUser) return;

    try {
      const userRef = doc(firestore, "users", selectedUser.id);

      await updateDoc(userRef, {
        role: selectedRole,
      });

      // Update local state
      setUsers(
        users.map((user) => {
          if (user.id === selectedUser.id) {
            return {
              ...user,
              role: selectedRole,
            };
          }
          return user;
        })
      );

      setSelectedUser(null);
    } catch (error) {
      console.error("Error changing role:", error);
      setError("Failed to change user role. Please try again.");
    }
  }

  async function handleDeleteUser(userId) {
    try {
      await deleteDoc(doc(firestore, "users", userId));

      // Update local state
      setUsers(users.filter((user) => user.id !== userId));
      setError(null);
    } catch (error) {
      console.error("Error deleting user:", error);
      setError("Failed to delete user. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">User Management</h1>
        <Button variant="outline" onClick={fetchUsers}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Manage user accounts, credits, and roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search users by name or email..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Credits Used</TableHead>
                  <TableHead>Date Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {user.name || "Unnamed User"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div
                        className={`px-2 py-1 rounded-full text-xs inline-flex items-center ${
                          user.role === "admin"
                            ? "bg-red-100 text-red-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {user.role === "admin" ? (
                          <Shield className="h-3 w-3 mr-1" />
                        ) : null}
                        {user.role || "user"}
                      </div>
                    </TableCell>
                    <TableCell>{user.credits || 0}</TableCell>
                    <TableCell>{user.creditsUsed || 0}</TableCell>
                    <TableCell>
                      {user.createdAt
                        ? new Date(
                            user.createdAt.seconds * 1000
                          ).toLocaleDateString()
                        : "Unknown"}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                            >
                              <CreditCard className="h-3.5 w-3.5 mr-1" />
                              Add Credits
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Credits</DialogTitle>
                              <DialogDescription>
                                Add credits to{" "}
                                {selectedUser?.name ||
                                  selectedUser?.email ||
                                  "this user"}
                                .
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">
                                  Amount
                                </label>
                                <Select
                                  value={creditAmount}
                                  onValueChange={setCreditAmount}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select amount" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1000">
                                      1,000 Credits
                                    </SelectItem>
                                    <SelectItem value="5000">
                                      5,000 Credits
                                    </SelectItem>
                                    <SelectItem value="10000">
                                      10,000 Credits
                                    </SelectItem>
                                    <SelectItem value="50000">
                                      50,000 Credits
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button onClick={handleAddCredits}>
                                Add Credits
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setSelectedRole(user.role || "user");
                              }}
                            >
                              <Edit className="h-3.5 w-3.5 mr-1" />
                              Change Role
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Change User Role</DialogTitle>
                              <DialogDescription>
                                Update role for{" "}
                                {selectedUser?.name ||
                                  selectedUser?.email ||
                                  "this user"}
                                .
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">
                                  Role
                                </label>
                                <Select
                                  value={selectedRole}
                                  onValueChange={setSelectedRole}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button onClick={handleChangeRole}>
                                Update Role
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Are you absolutely sure?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will
                                permanently delete the user account and all
                                associated data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => handleDeleteUser(user.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
