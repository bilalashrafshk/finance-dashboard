import { SharedNavbar } from "@/components/shared-navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">Privacy Policy</CardTitle>
              <CardDescription>
                Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 prose prose-slate dark:prose-invert max-w-none">
              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">1. Introduction</h2>
                <p>
                  Welcome to Conviction Play ("we," "our," or "us"). We are committed to protecting your privacy and ensuring you have a positive experience on our website and in using our products and services. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">2. Information We Collect</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">2.1 Information You Provide</h3>
                <p>We collect information that you provide directly to us, including:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Account Information:</strong> Name, email address, and password when you create an account</li>
                  <li><strong>Portfolio Data:</strong> Investment holdings, transaction history, and portfolio preferences</li>
                  <li><strong>Asset Tracking:</strong> Assets you track in the asset screener</li>
                  <li><strong>Communication:</strong> Information you provide when contacting us for support</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">2.2 Automatically Collected Information</h3>
                <p>When you use our services, we automatically collect certain information, including:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Usage Data:</strong> Pages visited, time spent on pages, and features used</li>
                  <li><strong>Device Information:</strong> Browser type, device type, operating system, and IP address</li>
                  <li><strong>Cookies and Tracking Technologies:</strong> See Section 5 for more details</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">3. How We Use Your Information</h2>
                <p>We use the information we collect to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide, maintain, and improve our services</li>
                  <li>Process transactions and manage your account</li>
                  <li>Send you technical notices, updates, and support messages</li>
                  <li>Respond to your comments, questions, and requests</li>
                  <li>Monitor and analyze trends, usage, and activities</li>
                  <li>Detect, prevent, and address technical issues and security threats</li>
                  <li>Personalize your experience and provide content relevant to your interests</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">4. Data Storage and Security</h2>
                <p>
                  We use industry-standard security measures to protect your personal information. Your data is stored securely in our database, and we implement appropriate technical and organizational measures to protect against unauthorized access, alteration, disclosure, or destruction of your personal information.
                </p>
                <p className="mt-2">
                  <strong>Password Security:</strong> Your passwords are hashed using bcrypt before storage. We never store passwords in plain text.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">5. Cookies and Tracking Technologies</h2>
                <p>
                  We use cookies and similar tracking technologies to track activity on our website and hold certain information. Cookies are files with a small amount of data which may include an anonymous unique identifier.
                </p>
                
                <h3 className="text-xl font-semibold mt-4 mb-2">5.1 Types of Cookies We Use</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Essential Cookies:</strong> Required for the website to function properly, including authentication and security</li>
                  <li><strong>Functional Cookies:</strong> Remember your preferences and settings (e.g., theme preferences)</li>
                  <li><strong>Analytics Cookies:</strong> Help us understand how visitors interact with our website</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">5.2 How to Control Cookies</h3>
                <p>
                  You can control and/or delete cookies as you wish. You can delete all cookies that are already on your computer and you can set most browsers to prevent them from being placed. However, if you do this, you may have to manually adjust some preferences every time you visit a site and some services and functionalities may not work.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">6. Third-Party Services</h2>
                <p>We use third-party services to provide certain features:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Database Services:</strong> We use Neon PostgreSQL for data storage</li>
                  <li><strong>Hosting:</strong> Our application is hosted on Vercel</li>
                  <li><strong>External APIs:</strong> We fetch financial data from Binance, StockAnalysis.com, and Investing.com (these services may have their own privacy policies)</li>
                </ul>
                <p className="mt-2">
                  We do not sell your personal information to third parties. We only share information as necessary to provide our services or as required by law.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">7. Your Rights and Choices</h2>
                <p>You have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Access:</strong> Request access to your personal information</li>
                  <li><strong>Correction:</strong> Update or correct your personal information through your account settings</li>
                  <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                  <li><strong>Data Portability:</strong> Request a copy of your data in a portable format</li>
                  <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications (if applicable)</li>
                </ul>
                <p className="mt-2">
                  To exercise these rights, please contact us or use the account settings in your profile.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">8. Data Retention</h2>
                <p>
                  We retain your personal information for as long as your account is active or as needed to provide you services. If you delete your account, we will delete or anonymize your personal information, except where we are required to retain it for legal, regulatory, or legitimate business purposes.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">9. Children's Privacy</h2>
                <p>
                  Our services are not intended for children under the age of 18. We do not knowingly collect personal information from children under 18. If you are a parent or guardian and believe your child has provided us with personal information, please contact us to have that information removed.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">10. International Data Transfers</h2>
                <p>
                  Your information may be transferred to and maintained on computers located outside of your state, province, country, or other governmental jurisdiction where data protection laws may differ. By using our services, you consent to the transfer of your information to our facilities and those third parties with whom we share it as described in this policy.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">11. Changes to This Privacy Policy</h2>
                <p>
                  We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">12. Contact Us</h2>
                <p>
                  If you have any questions about this Privacy Policy, please contact us:
                </p>
                <ul className="list-none pl-0 space-y-2 mt-2">
                  <li><strong>Email:</strong> support@stackthemgains.com</li>
                  <li><strong>Website:</strong> <a href="/" className="text-blue-600 dark:text-blue-400 hover:underline">stackthemgains.com</a></li>
                </ul>
              </section>

              <section className="mt-8 pt-6 border-t">
                <p className="text-sm text-muted-foreground">
                  By using our services, you acknowledge that you have read and understood this Privacy Policy and agree to the collection, use, and disclosure of your information as described herein.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

