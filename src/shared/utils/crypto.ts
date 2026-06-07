/**
 * VoidTab 加密工具模块
 *
 * 基于 Web Crypto API 提供加密/解密功能
 * 用于保护敏感数据（WebDAV 密码、API Key 等）
 *
 * @module crypto
 */

/**
 * 加密配置
 */
const CRYPTO_CONFIG = {
  algorithm: 'AES-GCM',
  keyLength: 256,
  ivLength: 12,
  saltLength: 16,
  iterations: 100000, // PBKDF2 迭代次数
  hash: 'SHA-256'
} as const;

/**
 * 从密码派生加密密钥
 * 使用 PBKDF2 算法
 *
 * @param password - 用户密码
 * @param salt - 盐值（可选，自动生成）
 * @returns 派生的密钥和盐值
 */
export async function deriveKey(
  password: string,
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  // 生成或使用现有盐值
  const saltBytes = salt || crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.saltLength));

  // 将密码转换为密钥材料
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // 派生加密密钥
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: CRYPTO_CONFIG.iterations,
      hash: CRYPTO_CONFIG.hash
    },
    passwordKey,
    {
      name: CRYPTO_CONFIG.algorithm,
      length: CRYPTO_CONFIG.keyLength
    },
    false,
    ['encrypt', 'decrypt']
  );

  return { key, salt: saltBytes };
}

/**
 * 加密数据
 *
 * @param data - 要加密的明文数据
 * @param password - 用户密码
 * @returns 加密后的数据（包含 IV 和 salt）
 */
export async function encrypt(data: string, password: string): Promise<string> {
  // 派生密钥
  const { key, salt } = await deriveKey(password);

  // 生成 IV
  const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.ivLength));

  // 加密数据
  const encrypted = await crypto.subtle.encrypt(
    {
      name: CRYPTO_CONFIG.algorithm,
      iv: iv as BufferSource
    },
    key,
    new TextEncoder().encode(data)
  );

  // 组合：salt + iv + encrypted
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  // 转换为 Base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * 解密数据
 *
 * @param encryptedData - 加密的数据（Base64 格式）
 * @param password - 用户密码
 * @returns 解密后的明文数据
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  try {
    // 从 Base64 解码
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // 提取 salt、iv 和加密数据
    const salt = combined.slice(0, CRYPTO_CONFIG.saltLength);
    const iv = combined.slice(CRYPTO_CONFIG.saltLength, CRYPTO_CONFIG.saltLength + CRYPTO_CONFIG.ivLength);
    const encrypted = combined.slice(CRYPTO_CONFIG.saltLength + CRYPTO_CONFIG.ivLength);

    // 派生密钥（使用相同的 salt）
    const { key } = await deriveKey(password, salt);

    // 解密
    const decrypted = await crypto.subtle.decrypt(
      {
        name: CRYPTO_CONFIG.algorithm,
        iv: iv as BufferSource
      },
      key,
      encrypted as BufferSource
    );

    // 转换为字符串
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error('解密失败：密码错误或数据损坏');
  }
}

/**
 * 生成随机密码
 * 用于生成安全的默认密码或测试
 *
 * @param length - 密码长度（默认 32）
 * @returns 随机密码
 */
export function generateRandomPassword(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 检查浏览器是否支持 Web Crypto API
 *
 * @returns 是否支持
 */
export function isCryptoSupported(): boolean {
  return typeof crypto !== 'undefined'
    && typeof crypto.subtle !== 'undefined'
    && typeof crypto.getRandomValues !== 'undefined';
}
