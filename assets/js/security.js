/**
 * Finance - Security Module
 * Handles WebAuthn (FaceID, TouchID, Windows Hello) integration.
 */

// Helper: Convert ArrayBuffer to Base64 String
function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return window.btoa(str);
}

// Helper: Convert Base64 String to ArrayBuffer
function base64ToBuffer(base64) {
    const str = window.atob(base64);
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i);
    }
    return bytes.buffer;
}

window.isBiometricsSupported = function () {
    return window.PublicKeyCredential !== undefined;
};

window.isBiometricsEnabled = function () {
    return localStorage.getItem('biometricCredId') !== null;
};

window.registerBiometrics = async function () {
    if (!isBiometricsSupported()) {
        Swal.fire({ icon: 'error', title: 'Not Supported', text: 'Your device or browser does not support WebAuthn biometrics.' });
        return false;
    }

    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const userId = new Uint8Array(16);
        window.crypto.getRandomValues(userId);

        const publicKey = {
            challenge: challenge,
            rp: {
                name: "Finance",
                id: window.location.hostname || "localhost"
            },
            user: {
                id: userId,
                name: "user@finance",
                displayName: "Finance User"
            },
            pubKeyCredParams: [
                { type: "public-key", alg: -7 }, // ES256
                { type: "public-key", alg: -257 } // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: "platform", // Forces built-in TouchID/FaceID instead of USB keys
                userVerification: "required"
            },
            timeout: 60000
        };

        const credential = await navigator.credentials.create({ publicKey });

        if (credential) {
            // Save the raw credential ID so we can verify it later
            const credIdBase64 = bufferToBase64(credential.rawId);
            localStorage.setItem('biometricCredId', credIdBase64);
            return true;
        }
        return false;
    } catch (err) {
        console.error("Biometric Registration Failed:", err);
        Swal.fire({ icon: 'warning', title: 'Registration Failed', text: err.message });
        return false;
    }
};

window.authenticateBiometrics = async function () {
    if (!isBiometricsSupported() || !isBiometricsEnabled()) return false;

    try {
        const credIdBase64 = localStorage.getItem('biometricCredId');
        const credIdBuffer = base64ToBuffer(credIdBase64);

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const publicKey = {
            challenge: challenge,
            allowCredentials: [{
                type: "public-key",
                id: credIdBuffer
            }],
            userVerification: "required",
            timeout: 60000
        };

        const assertion = await navigator.credentials.get({ publicKey });

        if (assertion) {
            return true;
        }
        return false;
    } catch (err) {
        console.error("Biometric Authentication Failed:", err);
        return false;
    }
};

window.disableBiometrics = function () {
    localStorage.removeItem('biometricCredId');
};
