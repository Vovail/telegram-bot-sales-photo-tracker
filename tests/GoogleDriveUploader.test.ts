import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleDriveUploader } from "../src/components/GoogleDriveUploader.js";
import type { drive_v3 } from "googleapis";

function createMockDrive() {
  return {
    files: {
      list: vi.fn(),
      create: vi.fn(),
    },
    permissions: {
      create: vi.fn(),
    },
  };
}

describe("GoogleDriveUploader", () => {
  describe("generateFileName", () => {
    it("should produce correct filename format", () => {
      const result = GoogleDriveUploader.generateFileName(
        "STORE_1",
        "2026-03-20",
        1,
        "jpg",
      );
      expect(result).toBe("STORE_1_2026-03-20_01.jpg");
    });

    it("should zero-pad single digit sequence numbers", () => {
      const result = GoogleDriveUploader.generateFileName(
        "STORE_2",
        "2026-04-01",
        3,
        "png",
      );
      expect(result).toBe("STORE_2_2026-04-01_03.png");
    });

    it("should not truncate double digit sequence numbers", () => {
      const result = GoogleDriveUploader.generateFileName(
        "STORE_1",
        "2026-03-20",
        12,
        "heic",
      );
      expect(result).toBe("STORE_1_2026-03-20_12.heic");
    });

    it("should handle sequence number 0", () => {
      const result = GoogleDriveUploader.generateFileName(
        "STORE_1",
        "2026-01-01",
        0,
        "jpg",
      );
      expect(result).toBe("STORE_1_2026-01-01_00.jpg");
    });
  });

  describe("uploadPhoto", () => {
    let mockDrive: ReturnType<typeof createMockDrive>;
    let uploader: GoogleDriveUploader;
    const photoBuffer = Buffer.from("fake-photo-data");

    beforeEach(() => {
      mockDrive = createMockDrive();
      uploader = new GoogleDriveUploader(
        mockDrive as unknown as drive_v3.Drive,
      );
    });

    it("should find existing subfolder and upload file", async () => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [{ id: "existing-folder-id", name: "2026-03" }] },
      });
      mockDrive.files.create.mockResolvedValue({
        data: { id: "new-file-id" },
      });
      mockDrive.permissions.create.mockResolvedValue({});

      const result = await uploader.uploadPhoto(
        photoBuffer,
        "STORE_1_2026-03-20_01.jpg",
        "shared-folder-id",
        "2026-03",
      );

      expect(result).toEqual({
        fileId: "new-file-id",
        shareableLink:
          "https://drive.google.com/file/d/new-file-id/view?usp=sharing",
        fileName: "STORE_1_2026-03-20_01.jpg",
      });

      // Should have searched for existing folder
      expect(mockDrive.files.list).toHaveBeenCalledOnce();

      // Should NOT have created a folder (reused existing)
      // files.create called once for the file upload only
      expect(mockDrive.files.create).toHaveBeenCalledOnce();

      // Should have set permissions
      expect(mockDrive.permissions.create).toHaveBeenCalledWith({
        fileId: "new-file-id",
        requestBody: { role: "reader", type: "anyone" },
        supportsAllDrives: true,
      });
    });

    it("should create subfolder when it does not exist", async () => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [] },
      });
      // First create call = folder, second = file upload
      mockDrive.files.create
        .mockResolvedValueOnce({ data: { id: "new-folder-id" } })
        .mockResolvedValueOnce({ data: { id: "new-file-id" } });
      mockDrive.permissions.create.mockResolvedValue({});

      const result = await uploader.uploadPhoto(
        photoBuffer,
        "STORE_1_2026-03-20_01.jpg",
        "shared-folder-id",
        "2026-03",
      );

      expect(result).not.toBeNull();
      expect(result!.fileId).toBe("new-file-id");

      // Two create calls: folder + file
      expect(mockDrive.files.create).toHaveBeenCalledTimes(2);
    });

    it("should return null on upload failure (graceful degradation)", async () => {
      mockDrive.files.list.mockRejectedValue(new Error("Network error"));

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await uploader.uploadPhoto(
        photoBuffer,
        "STORE_1_2026-03-20_01.jpg",
        "shared-folder-id",
        "2026-03",
      );

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should return null when file create returns no ID", async () => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [{ id: "folder-id", name: "2026-03" }] },
      });
      mockDrive.files.create.mockResolvedValue({
        data: { id: null },
      });

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await uploader.uploadPhoto(
        photoBuffer,
        "STORE_1_2026-03-20_01.jpg",
        "shared-folder-id",
        "2026-03",
      );

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("should return null when permissions call fails", async () => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [{ id: "folder-id", name: "2026-03" }] },
      });
      mockDrive.files.create.mockResolvedValue({
        data: { id: "file-id" },
      });
      mockDrive.permissions.create.mockRejectedValue(
        new Error("Permission denied"),
      );

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await uploader.uploadPhoto(
        photoBuffer,
        "STORE_1_2026-03-20_01.jpg",
        "shared-folder-id",
        "2026-03",
      );

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });
});
