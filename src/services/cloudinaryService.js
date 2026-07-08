const cloudinary = require("cloudinary").v2;

class CloudinaryService {
  /**
   * Delete images from Cloudinary
   * @param {Array} imageUrls - Array of Cloudinary image URLs
   * @returns {Promise<Array>} - Results of deletion
   */
  static async deleteImages(imageUrls) {
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return [];
    }

    const deletePromises = imageUrls.map(async (url) => {
      try {
        // Extract public ID from Cloudinary URL
        const publicId = this.extractPublicId(url);
        if (!publicId) return null;

        const result = await cloudinary.uploader.destroy(publicId);
        return {
          url,
          publicId,
          success: result.result === "ok",
          message:
            result.result === "ok" ? "Deleted successfully" : "Delete failed",
        };
      } catch (error) {
        console.error(`Failed to delete image ${url}:`, error.message);
        return {
          url,
          success: false,
          message: error.message,
        };
      }
    });

    return Promise.all(deletePromises);
  }

  /**
   * Extract public ID from Cloudinary URL
   * @param {string} url - Cloudinary image URL
   * @returns {string|null} - Public ID or null
   */
  static extractPublicId(url) {
    if (!url) return null;

    try {
      // Handle different Cloudinary URL formats
      // Format 1: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/product-123.jpg
      // Format 2: https://res.cloudinary.com/cloud_name/image/upload/folder/product-123.jpg

      const cloudName = cloudinary.config().cloud_name;
      const regex = new RegExp(
        `res\\.cloudinary\\.com/${cloudName}/image/upload/(?:v\\d+/)?([^/.]+(?:/[^/.]+)*)`,
      );
      const match = url.match(regex);

      if (match && match[1]) {
        return match[1];
      }
      return null;
    } catch (error) {
      console.error("Error extracting public ID:", error);
      return null;
    }
  }

  /**
   * Upload image to Cloudinary
   * @param {Object} file - File object from multer
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} - Upload result
   */
  static async uploadImage(file, options = {}) {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: options.folder || "adult-novelty/products",
        transformation: options.transformation || [
          { width: 800, height: 800, crop: "limit" },
          { quality: "auto" },
        ],
        public_id:
          options.public_id ||
          `product-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      });

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      };
    } catch (error) {
      console.error("Error uploading to Cloudinary:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Get optimized URL for Cloudinary image
   * @param {string} url - Original Cloudinary URL
   * @param {Object} transformations - Transformations to apply
   * @returns {string} - Optimized URL
   */
  static getOptimizedUrl(url, transformations = {}) {
    if (!url) return null;

    const {
      width = 400,
      height = 400,
      crop = "limit",
      quality = "auto",
      format = "auto",
    } = transformations;

    try {
      // Parse the URL
      const urlParts = url.split("/");
      const uploadIndex = urlParts.indexOf("upload");

      if (uploadIndex === -1) return url;

      // Build transformation string
      const transformStr = `w_${width},h_${height},c_${crop},q_${quality},f_${format}`;

      // Insert transformation after 'upload'
      urlParts.splice(uploadIndex + 1, 0, transformStr);

      return urlParts.join("/");
    } catch (error) {
      console.error("Error optimizing URL:", error);
      return url;
    }
  }
}

module.exports = CloudinaryService;
