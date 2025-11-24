import { SharedNavbar } from "@/components/shared-navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldCheck, Lock, Database, Key, Eye, AlertTriangle } from "lucide-react"

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-2">
                <ShieldCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                Security
              </CardTitle>
              <CardDescription>
                How we protect your data and ensure platform security
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <section>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <Lock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  Data Protection
                </h2>
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Password Security</h3>
                    <p className="text-sm text-muted-foreground">
                      All user passwords are hashed using bcrypt before storage. We never store passwords in plain text, and our authentication system follows industry best practices.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Encryption</h3>
                    <p className="text-sm text-muted-foreground">
                      All data transmitted between your browser and our servers is encrypted using TLS/SSL. Your sensitive information is protected during transmission.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Database Security</h3>
                    <p className="text-sm text-muted-foreground">
                      We use Neon PostgreSQL with SSL-encrypted connections. Database access is restricted and monitored. Regular backups ensure data integrity and availability.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  Infrastructure Security
                </h2>
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Hosting & Infrastructure</h3>
                    <p className="text-sm text-muted-foreground">
                      Our application is hosted on Vercel, which provides enterprise-grade security, DDoS protection, and automatic SSL certificates. All infrastructure follows security best practices.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">API Security</h3>
                    <p className="text-sm text-muted-foreground">
                      API endpoints are protected with authentication and authorization. We implement rate limiting to prevent abuse and protect against common attacks.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <Key className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  Access Control
                </h2>
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">User Authentication</h3>
                    <p className="text-sm text-muted-foreground">
                      Secure session management ensures that only authenticated users can access their accounts. Sessions expire after periods of inactivity.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Data Isolation</h3>
                    <p className="text-sm text-muted-foreground">
                      User data is isolated and can only be accessed by the account owner. We implement strict access controls to ensure data privacy.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <Eye className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  Monitoring & Incident Response
                </h2>
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Security Monitoring</h3>
                    <p className="text-sm text-muted-foreground">
                      We continuously monitor our systems for suspicious activity, unauthorized access attempts, and potential security threats. Automated alerts help us respond quickly to any issues.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Incident Response</h3>
                    <p className="text-sm text-muted-foreground">
                      In the event of a security incident, we have procedures in place to quickly assess, contain, and remediate the issue. Affected users will be notified as required by law.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  Your Responsibility
                </h2>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">
                    While we take security seriously, you also play an important role in keeping your account secure:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                    <li>Use a strong, unique password for your account</li>
                    <li>Do not share your login credentials with anyone</li>
                    <li>Log out when using shared or public computers</li>
                    <li>Report any suspicious activity immediately</li>
                    <li>Keep your browser and operating system updated</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">Reporting Security Issues</h2>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    If you discover a security vulnerability or have concerns about our security practices, please contact us immediately at:
                  </p>
                  <p className="mt-2 font-semibold">security@convictionplay.com</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    We appreciate responsible disclosure and will work with you to address any security concerns.
                  </p>
                </div>
              </section>

              <section className="pt-6 border-t">
                <p className="text-sm text-muted-foreground">
                  Security is an ongoing process, and we continuously work to improve our security measures. This page was last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

