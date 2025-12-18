const functions = require("firebase-functions");
const admin = require("firebase-admin");
const vision = require("@google-cloud/vision");

admin.initializeApp();

// V1 Syntax: functions.storage.object().onFinalize
exports.moderateImage = functions.storage.object().onFinalize(async (object) => {
    // 1. Check if image
    if (!object.contentType.startsWith("image/")) {
        console.log("Not an image:", object.contentType);
        return null;
    }

    const docId = object.name.split('/').pop().split('.')[0];
    console.log(`Processing document ID: ${docId}`);

    try {
        const client = new vision.ImageAnnotatorClient();

        // Download file for Emulator access (bypasses gs:// issues)
        // This is safe for production too as it reads from the bucket directly
        const bucket = admin.storage().bucket(object.bucket);
        const file = bucket.file(object.name);

        console.log("Downloading file content...");
        const [fileContent] = await file.download();

        // Analyze
        const [result] = await client.safeSearchDetection(fileContent);
        const detections = result.safeSearchAnnotation || {};

        console.log(`🔎 Scan Result for ${docId}:`, detections);

        // 2. STRICTER RULES (User's Logic)
        const isUnsafe =
            detections.adult === "LIKELY" || detections.adult === "VERY_LIKELY" || detections.adult === "POSSIBLE" ||
            detections.violence === "LIKELY" || detections.violence === "VERY_LIKELY" || detections.violence === "POSSIBLE" ||
            detections.racy === "LIKELY" || detections.racy === "VERY_LIKELY";

        if (isUnsafe) {
            console.log(`🛑 BLOCKED: ${docId} (NSFW or Violence detected)`);
            await file.delete();
            await admin.firestore().collection("items").doc(docId).update({
                status: "rejected",
                reason: "Content flagged as unsafe"
            });
        } else {
            console.log(`✅ APPROVED: ${docId}`);

            // Emulator Fallback for Signed URL
            let publicUrl;
            try {
                // Determine if we are running in emulator
                const isEmulator = process.env.FUNCTIONS_EMULATOR;

                if (isEmulator) {
                    throw new Error("Force emulator fallback");
                }

                const urls = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
                publicUrl = urls[0];
            } catch (signError) {
                console.warn("Using Emulator Public URL fallback");
                publicUrl = `http://127.0.0.1:9199/v0/b/${object.bucket}/o/${encodeURIComponent(object.name)}?alt=media`;
            }

            await admin.firestore().collection("items").doc(docId).update({
                status: "approved",
                publicUrl: publicUrl
            });
        }

    } catch (error) {
        console.error("Error analyzing image:", error);
        try {
            await admin.firestore().collection("items").doc(docId).update({
                status: "failed",
                error: error.message
            });
        } catch (e) {
            console.error("Failed to write error to Firestore", e);
        }
    }
});
