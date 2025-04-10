"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getUserProfile,
  addCreditsToUser,
  getUserCreditHistory,
} from "../lib/firestoreService";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { CreditCard, Plus, RefreshCw, Clock } from "lucide-react";

export default function CreditManager() {
  const { user } = useAuth();
  const [credits, setCredits] = useState(0);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [creditHistory, setCreditHistory] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch user credits and history on component mount
  useEffect(() => {
    fetchUserData();
  }, [user]);

  // Update the fetchUserData function in src/components/credit-manager.js

  // Update fetchUserData in credit-manager.js
  // Add this to all fetch calls to your API

  const fetchUserData = async () => {
    try {
      setIsRefreshing(true);
      if (user) {
        // Get current auth token
        const token = await user.getIdToken();

        // Include it in requests
        const userProfile = await getUserProfile(user.uid, token);
        if (userProfile) {
          setCredits(userProfile.credits || 0);
          setCreditsUsed(userProfile.creditsUsed || 0);
        }

        try {
          const history = await getUserCreditHistory(user.uid, token);
          setCreditHistory(history);
        } catch (historyError) {
          console.error("Error getting credit history:", historyError);
          setCreditHistory([]);
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setError("Failed to load credit information. Please try again.");
    } finally {
      setIsRefreshing(false);
    }
  };
  // For demo: Add credits to user (In production, this would connect to a payment system)
  const handleAddCredits = async (amount) => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      // In a real application, this would go through a payment processor
      // and only add credits after successful payment
      await addCreditsToUser(user.uid, amount);

      setSuccess(`Successfully added ${amount} credits to your account.`);

      // Refresh user data
      await fetchUserData();
    } catch (error) {
      console.error("Error adding credits:", error);
      setError("Failed to add credits. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Credit Management</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchUserData}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 text-green-800 border-green-200">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Available Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-indigo-600">{credits}</div>
            <p className="text-xs text-gray-500">
              Each credit generates one synthetic clause
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Credits Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{creditsUsed}</div>
            <p className="text-xs text-gray-500">
              Total credits consumed so far
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Purchase Credits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleAddCredits(1000)}
                disabled={loading}
              >
                <Plus className="h-4 w-4 mr-1" />
                1,000
              </Button>

              <Button
                variant="outline"
                onClick={() => handleAddCredits(5000)}
                disabled={loading}
              >
                <Plus className="h-4 w-4 mr-1" />
                5,000
              </Button>

              <Button
                variant="outline"
                onClick={() => handleAddCredits(10000)}
                disabled={loading}
              >
                <Plus className="h-4 w-4 mr-1" />
                10,000
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              In a production app, this would connect to a payment system
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credit Usage History</CardTitle>
          <CardDescription>
            Recent transactions and processing activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          {creditHistory.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <Clock className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p>No credit usage history yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {creditHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center border-b pb-3"
                >
                  <div>
                    <p className="font-medium">
                      {item.description || "Document Processing"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(item.timestamp.seconds * 1000).toLocaleString()}
                    </p>
                  </div>
                  <div
                    className={`font-semibold ${
                      item.type === "purchase"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {item.type === "purchase" ? "+" : "-"}
                    {item.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="bg-gray-50 border-t flex justify-center p-6">
          <div className="text-sm text-gray-600 max-w-md text-center">
            <p>
              Each credit allows you to generate one synthetic variant of a
              clause from your documents.
            </p>
            <p className="mt-2">
              Credits are consumed when documents are processed through the
              three-model pipeline.
            </p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
