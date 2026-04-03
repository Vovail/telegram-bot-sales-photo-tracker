import { Readable } from "stream";
import type { drive_v3 } from "googleapis";
import type { UploadResult } from "../types/index.js";

export class GoogleDriveUploader {
  private drive: drive_v3.Drive;

  constructor(drive: drive_v3.Drive) {
    this.drive = drive;
  }

  /**
   * Generate a filename for a store photo.
   * Format: "{storeId}_{date}_{sequence}.{extension}"
   * Sequence is zero-padded to at least 2 digits.
   */
  static generateFileName(
    storeId: string,
    date: string,
    sequenceNumber: number,
    extension: string,
  ): string {
    const paddedSequence = String(sequenceNumber).padStart(2, "0");
    return `${storeId}_${date}_${paddedSequence}.${extension}`;
  }

  /**
   * Upload a photo to Google Drive under a month subfolder.
   * Returns UploadResult on success, or null on any error (graceful degradation).
   */
  async uploadPhoto(
    photoBuffer: Buffer,
    fileName: string,
    sharedFolderId: string,
    monthSubfolder: string,
  ): Promise<UploadResult | null> {
    try {
      const folderId = await this.findOrCreateSubfolder(
        sharedFolderId,
        monthSubfolder,
      );

      const fileMetadata = {
        name: fileName,
        parents: [folderId],
      };

      const media = {
        mimeType: this.getMimeType(fileName),
        body: Readable.from(photoBuffer),
      };

      const createResponse = await this.drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: "id",
        supportsAllDrives: true,
      });

      const fileId = createResponse.data.id;
      if (!fileId) {
        console.error(
          `Google Drive upload failed: no file ID returned for ${fileName}`,
        );
        return null;
      }

      await this.drive.permissions.create({
        fileId,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
        supportsAllDrives: true,
      });

      const shareableLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

      return {
        fileId,
        shareableLink,
        fileName,
      };
    } catch (error) {
      console.error(
        `Google Drive upload failed for ${fileName}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  /**
   * Find an existing subfolder by name under a parent, or create it.
   */
  private async findOrCreateSubfolder(
    parentFolderId: string,
    folderName: string,
  ): Promise<string> {
    const query = `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

    const listResponse = await this.drive.files.list({
      q: query,
      fields: "files(id, name)",
      spaces: "drive",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const existing = listResponse.data.files;
    if (existing && existing.length > 0 && existing[0].id) {
      return existing[0].id;
    }

    const createResponse = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      },
      fields: "id",
      supportsAllDrives: true,
    });

    const folderId = createResponse.data.id;
    if (!folderId) {
      throw new Error(
        `Failed to create subfolder '${folderName}' under parent '${parentFolderId}'`,
      );
    }

    return folderId;
  }

  /**
   * Derive MIME type from filename extension.
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png":
        return "image/png";
      case "heic":
        return "image/heic";
      case "jpg":
      case "jpeg":
      default:
        return "image/jpeg";
    }
  }
}
