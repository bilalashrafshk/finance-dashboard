"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/lib/auth/auth-context"
import { useToast } from "@/hooks/use-toast"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { user, updateUser } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // Password visibility
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Fetch user data when dialog opens
  useEffect(() => {
    if (open && user) {
      setFetching(true)
      fetchUserProfile()
    } else if (!open) {
      // Reset form when dialog closes
      resetForm()
    }
  }, [open, user])

  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Not authenticated')
        return
      }

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.user) {
          setName(data.user.name || '')
          setEmail(data.user.email || '')
        }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to load profile')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile')
    } finally {
      setFetching(false)
    }
  }

  const resetForm = () => {
    setName('')
    setEmail('')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      // Validate password if new password is provided
      if (newPassword) {
        if (!currentPassword) {
          setError('Current password is required to change password')
          setLoading(false)
          return
        }
        
        if (newPassword.length < 6) {
          setError('New password must be at least 6 characters')
          setLoading(false)
          return
        }
        
        if (newPassword !== confirmPassword) {
          setError('New passwords do not match')
          setLoading(false)
          return
        }
      }

      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const updateData: any = {}
      
      // Only include fields that have changed
      if (name !== (user?.name || '')) {
        updateData.name = name.trim() || null
      }
      
      if (email !== (user?.email || '')) {
        updateData.email = email.trim()
      }
      
      if (newPassword) {
        updateData.currentPassword = currentPassword
        updateData.newPassword = newPassword
      }

      // If nothing to update
      if (Object.keys(updateData).length === 0) {
        setError('No changes to save')
        setLoading(false)
        return
      }

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setSuccess(true)
        
        // Update auth context with new user data
        if (data.user) {
          updateUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
          })
        }
        
        toast({
          title: "Profile Updated",
          description: "Your profile has been updated successfully.",
        })
        
        // Reset password fields
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        
        // Close dialog after a short delay
        setTimeout(() => {
          onOpenChange(false)
        }, 1500)
      } else {
        setError(data.error || 'Failed to update profile')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const hasChanges = () => {
    const nameChanged = name !== (user?.name || '')
    const emailChanged = email !== (user?.email || '')
    const passwordChanged = newPassword.length > 0
    
    return nameChanged || emailChanged || passwordChanged
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
          <DialogDescription>
            Update your account information. Leave password fields empty if you don't want to change your password.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-4">
            {fetching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Name Field */}
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>

                {/* Email Field */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    required
                  />
                </div>

                {/* Password Section */}
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Change Password</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Leave blank if you don't want to change your password
                    </p>
                  </div>

                  {/* Current Password */}
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 6 characters)"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Error Alert */}
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Success Alert */}
                {success && (
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertDescription className="text-green-800 dark:text-green-200">
                      Profile updated successfully!
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || fetching || !hasChanges()}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

