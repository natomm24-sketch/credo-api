const crypto = require("crypto");

class Keepz {
  constructor(rsaPublicKey, rsaPrivateKey) {
    this.rsaPublicKey = rsaPublicKey;
    this.rsaPrivateKey = rsaPrivateKey;
  }

  encrypt(data) {
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
    const encryptedData = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(data), "utf8")),
      cipher.final(),
    ]);

    const encodedKey = aesKey.toString("base64");
    const encodedIV = iv.toString("base64");
    const concat = `${encodedKey}.${encodedIV}`;

    const rsaPublicKey = crypto.createPublicKey({
      key: Buffer.from(this.rsaPublicKey, "base64"),
      format: "der",
      type: "spki",
    });

    const encryptedKeys = crypto.publicEncrypt(
      {
        key: rsaPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(concat, "utf8")
    );

    return {
      encryptedData: encryptedData.toString("base64"),
      encryptedKeys: encryptedKeys.toString("base64"),
    };
  }

  decrypt(encryptedDataB64, encryptedKeysB64) {
    const rsaPrivateKey = crypto.createPrivateKey({
      key: Buffer.from(this.rsaPrivateKey, "base64"),
      format: "der",
      type: "pkcs8",
    });

    const decryptedConcat = crypto
      .privateDecrypt(
        {
          key: rsaPrivateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        Buffer.from(encryptedKeysB64, "base64")
      )
      .toString("utf8");

    const [encodedKey, encodedIV] = decryptedConcat.split(".");
    const aesKey = Buffer.from(encodedKey, "base64");
    const iv = Buffer.from(encodedIV, "base64");

    const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
    const decryptedData = Buffer.concat([
      decipher.update(Buffer.from(encryptedDataB64, "base64")),
      decipher.final(),
    ]);

    return JSON.parse(decryptedData.toString("utf8"));
  }
}

module.exports = Keepz;
