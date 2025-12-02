# Portfolio Data Security Best Practices

## Current State Analysis

Your current implementation:
- ✅ **Passwords**: Properly hashed using bcrypt/argon2 (one-way, cannot be decrypted)
- ✅ **Authentication**: JWT tokens with user verification
- ✅ **Authorization**: User-scoped queries (`WHERE user_id = $1`)
- ⚠️ **Portfolio Data**: Stored in **plain text** in the database
- ⚠️ **Transit**: HTTPS (assumed, but verify)
- ⚠️ **At Rest**: No encryption on sensitive portfolio fields

## Hashing vs Encryption: Key Difference

### ❌ **Hashing is NOT appropriate for portfolio data**

**Hashing** (what you use for passwords):
- One-way function (cannot be reversed)
- Same input always produces same output
- Used for: passwords, verification, integrity checks
- **Cannot retrieve original data** - you can only verify if input matches hash

**Encryption** (what you need for portfolio data):
- Two-way function (can be decrypted)
- Same input produces different output each time (with proper IV/salt)
- Used for: sensitive data that needs to be retrieved
- **Can retrieve original data** with the decryption key

### Why Portfolio Trackers Don't Hash Portfolio Data

Portfolio data (quantities, prices, holdings) **must be retrievable** for:
- Displaying portfolio values
- Calculating P&L
- Generating charts and reports
- Historical analysis

If you hashed portfolio data, you couldn't:
- Show users their holdings
- Calculate returns
- Display charts
- Generate reports

## Industry Best Practices

### 1. **Database-Level Encryption (Transparent Data Encryption - TDE)**

**What it is**: Encrypts entire database or specific columns at the storage level.

**Pros**:
- Transparent to application code
- Protects against physical database theft
- No code changes needed

**Cons**:
- Database admin can still decrypt
- Doesn't protect against application-level breaches
- Performance overhead (usually minimal)

**Implementation**: 
- PostgreSQL: Use `pgcrypto` extension or database-level encryption
- Most cloud providers (AWS RDS, Vercel Postgres) offer TDE by default

### 2. **Application-Level Encryption (Field-Level Encryption)**

**What it is**: Encrypt sensitive fields before storing in database.

**Pros**:
- More granular control
- Can use different keys per user
- Protects against database admin access

**Cons**:
- Requires code changes
- Key management complexity
- Performance overhead (encrypt/decrypt on read/write)

**Implementation**:
```typescript
// Example with AES-256-GCM
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex') // 32 bytes

function encrypt(text: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return { encrypted, iv: iv.toString('hex'), tag: tag.toString('hex') }
}

function decrypt(encrypted: string, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

### 3. **What Major Portfolio Trackers Actually Do**

Based on industry analysis:

1. **Personal Capital / Empower**:
   - Database encryption at rest (TDE)
   - TLS/SSL in transit
   - Strong authentication (MFA)
   - **No field-level encryption** (performance reasons)

2. **Mint / Credit Karma**:
   - Database encryption
   - API encryption
   - **No field-level encryption** for portfolio data

3. **Yahoo Finance Portfolio**:
   - HTTPS only
   - Basic encryption
   - **No field-level encryption**

4. **CoinTracker / Koinly** (Crypto):
   - Database encryption
   - API keys encrypted separately
   - **Portfolio data not field-encrypted** (but API keys are)

**Key Insight**: Most portfolio trackers rely on:
- ✅ Database-level encryption (TDE)
- ✅ Strong authentication & authorization
- ✅ HTTPS/TLS in transit
- ✅ Proper access controls
- ❌ **NOT field-level encryption** for portfolio data (too expensive, not necessary)

## Recommended Security Stack for Your App

### Tier 1: Essential (Do This Now)

1. **Ensure HTTPS/TLS in Transit**
   ```typescript
   // Verify all API routes use HTTPS
   // Vercel/Next.js handles this automatically, but verify
   ```

2. **Database Encryption at Rest**
   - ✅ **Vercel Postgres**: Already encrypted by default
   - ✅ **AWS RDS**: Enable encryption
   - ✅ **Self-hosted**: Use PostgreSQL TDE or filesystem encryption

3. **Strengthen Access Controls**
   ```sql
   -- Ensure all queries filter by user_id
   -- Add row-level security policies (PostgreSQL 9.5+)
   CREATE POLICY user_holdings_isolation ON user_holdings
     USING (user_id = current_setting('app.user_id')::int);
   ```

4. **Audit Logging**
   ```sql
   CREATE TABLE audit_log (
     id SERIAL PRIMARY KEY,
     user_id INTEGER,
     action VARCHAR(50), -- 'view', 'create', 'update', 'delete'
     table_name VARCHAR(50),
     record_id INTEGER,
     ip_address INET,
     user_agent TEXT,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

### Tier 2: Enhanced Security (Consider for Production)

1. **Multi-Factor Authentication (MFA)**
   ```typescript
   // Add TOTP (Time-based One-Time Password) support
   // Use libraries like: speakeasy, otplib
   ```

2. **Rate Limiting**
   ```typescript
   // Prevent brute force attacks
   // Use: next-rate-limit, upstash/ratelimit
   ```

3. **Input Validation & Sanitization**
   ```typescript
   // Validate all inputs
   // Use: zod, yup for schema validation
   ```

4. **Sensitive Field Masking**
   ```typescript
   // In logs/error messages, mask sensitive data
   function maskSensitiveData(data: any) {
     return {
       ...data,
       quantity: '***',
       purchasePrice: '***',
       // Keep only non-sensitive fields for debugging
     }
   }
   ```

### Tier 3: Advanced (For High-Value Portfolios)

1. **Field-Level Encryption** (Only if required by compliance)
   - Use for: SSN, bank account numbers, API keys
   - **NOT recommended** for: portfolio quantities, prices (performance impact)

2. **Key Management Service (KMS)**
   - AWS KMS, Google Cloud KMS, HashiCorp Vault
   - Rotate encryption keys regularly

3. **Data Anonymization for Analytics**
   ```sql
   -- Use aggregated/anonymized data for analytics
   -- Never expose individual user data
   ```

## What NOT to Do

❌ **Don't hash portfolio data** - You need to retrieve it
❌ **Don't store encryption keys in code** - Use environment variables or KMS
❌ **Don't log sensitive data** - Mask quantities, prices in logs
❌ **Don't expose user_id in URLs** - Use tokens/sessions
❌ **Don't trust client-side data** - Always validate on server

## Compliance Considerations

### GDPR (EU Users)
- Right to access data
- Right to deletion
- Data portability
- **Encryption recommended** but not strictly required

### CCPA (California)
- Similar to GDPR
- Encryption helps with breach notification requirements

### Financial Regulations
- If handling real money (not just tracking), stricter requirements
- May need: SOC 2, PCI DSS compliance
- Field-level encryption may be required

## Recommended Implementation Priority

### Phase 1: Immediate (Week 1)
1. ✅ Verify database encryption at rest (Vercel Postgres has this)
2. ✅ Verify HTTPS/TLS in transit
3. ✅ Add audit logging for sensitive operations
4. ✅ Review all queries for proper `user_id` filtering

### Phase 2: Short-term (Month 1)
1. Add MFA support
2. Implement rate limiting
3. Add input validation with Zod
4. Mask sensitive data in logs

### Phase 3: Long-term (Quarter 1)
1. Consider field-level encryption for notes (if they contain sensitive info)
2. Implement key rotation
3. Add data export/deletion features (GDPR compliance)
4. Security audit/penetration testing

## Code Example: Adding Audit Logging

```typescript
// lib/portfolio/audit-log.ts
export async function logPortfolioAccess(
  userId: number,
  action: 'view' | 'create' | 'update' | 'delete',
  tableName: string,
  recordId: number | null,
  request: NextRequest
) {
  const pool = getPool()
  const client = await pool.connect()
  
  try {
    await client.query(
      `INSERT INTO audit_log (user_id, action, table_name, record_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        action,
        tableName,
        recordId,
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        request.headers.get('user-agent') || 'unknown'
      ]
    )
  } finally {
    client.release()
  }
}

// Usage in API route
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  
  // ... fetch holdings ...
  
  await logPortfolioAccess(user.id, 'view', 'user_holdings', null, request)
  
  return NextResponse.json({ success: true, holdings })
}
```

## Summary

**For your portfolio tracker:**

1. ✅ **You're already doing well**: Password hashing, JWT auth, user-scoped queries
2. ⚠️ **Verify**: Database encryption at rest (Vercel Postgres should have this)
3. ⚠️ **Add**: Audit logging, rate limiting, MFA
4. ❌ **Don't add**: Field-level encryption for portfolio data (not necessary, performance impact)

**The industry standard is:**
- Database encryption at rest ✅
- Strong authentication ✅
- Proper authorization ✅
- **NOT** field-level encryption for portfolio data ❌

Your current approach is actually aligned with industry best practices. Focus on strengthening access controls, adding audit trails, and ensuring proper encryption at the database level rather than field-level encryption.


