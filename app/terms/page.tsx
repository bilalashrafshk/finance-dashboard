import { SharedNavbar } from "@/components/shared-navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">Terms of Service</CardTitle>
              <CardDescription>
                Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 prose prose-slate dark:prose-invert max-w-none">
              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">1. Acceptance of Terms</h2>
                <p>
                  By accessing and using CONVICTION PLAY ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">2. Description of Service</h2>
                <p>
                  CONVICTION PLAY is a quantitative research platform that provides market analysis, portfolio tracking, risk metrics, and asset screening tools. The Service focuses primarily on Pakistani equities but also provides research and analysis for US equities, cryptocurrencies, and metals.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">3. User Accounts</h2>
                <p>To access certain features of the Service, you must register for an account. You agree to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide accurate, current, and complete information during registration</li>
                  <li>Maintain and update your information to keep it accurate, current, and complete</li>
                  <li>Maintain the security of your password and identification</li>
                  <li>Accept all responsibility for activities that occur under your account</li>
                  <li>Notify us immediately of any unauthorized use of your account</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">4. Use of Service</h2>
                <p>You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Use the Service in any way that violates any applicable law or regulation</li>
                  <li>Attempt to gain unauthorized access to the Service or its related systems</li>
                  <li>Interfere with or disrupt the Service or servers connected to the Service</li>
                  <li>Use any automated system to access the Service without our express written permission</li>
                  <li>Reproduce, duplicate, copy, sell, or exploit any portion of the Service without our express written permission</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">5. Data and Information</h2>
                <p>
                  The Service provides financial data and analysis tools for informational purposes only. The data and information provided:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Are not intended as investment, financial, or trading advice</li>
                  <li>Should not be relied upon as the sole basis for investment decisions</li>
                  <li>May contain errors or inaccuracies</li>
                  <li>Are provided "as is" without warranties of any kind</li>
                </ul>
                <p className="mt-2">
                  You acknowledge that all investment decisions are your own responsibility and that CONVICTION PLAY is not liable for any losses or damages resulting from your use of the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">6. Intellectual Property</h2>
                <p>
                  The Service and its original content, features, and functionality are owned by CONVICTION PLAY and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
                </p>
                <p className="mt-2">
                  You may not modify, reproduce, distribute, create derivative works, publicly display, or otherwise use any content from the Service without our prior written permission.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">7. Third-Party Services</h2>
                <p>
                  The Service may use third-party services and APIs to provide data and functionality. These services may have their own terms of service and privacy policies. We are not responsible for the practices of third-party services.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">8. Disclaimer of Warranties</h2>
                <p>
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
                </p>
                <p className="mt-2">
                  We do not warrant that the Service will be uninterrupted, secure, or error-free, or that defects will be corrected.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">9. Limitation of Liability</h2>
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, CONVICTION PLAY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">10. Termination</h2>
                <p>
                  We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms.
                </p>
                <p className="mt-2">
                  Upon termination, your right to use the Service will cease immediately. All provisions of these Terms that by their nature should survive termination shall survive termination.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">11. Changes to Terms</h2>
                <p>
                  We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect.
                </p>
                <p className="mt-2">
                  By continuing to access or use the Service after any revisions become effective, you agree to be bound by the revised terms.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-6 mb-4">12. Contact Information</h2>
                <p>
                  If you have any questions about these Terms of Service, please contact us:
                </p>
                <ul className="list-none pl-0 space-y-2 mt-2">
                  <li><strong>Email:</strong> support@convictionplay.com</li>
                </ul>
              </section>

              <section className="mt-8 pt-6 border-t">
                <p className="text-sm text-muted-foreground">
                  By using our services, you acknowledge that you have read and understood these Terms of Service and agree to be bound by them.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

