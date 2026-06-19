// Google Drive API Integration Helpers (REST-based implementation)

export interface BackupObject {
  days: Record<number, any>;
  subscribers: any[];
  password?: string;
}

/**
 * Searches for a specific folder by name in the user's Google Drive.
 * If not found, returns null.
 */
export async function searchFolder(token: string, folderName: string): Promise<string | null> {
  try {
    const q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to search folder: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  } catch (error) {
    console.error("GDrive: error searching folder:", error);
    throw error;
  }
}

/**
 * Creates a folder in the user's Google Drive.
 */
export async function createFolder(token: string, folderName: string): Promise<string> {
  try {
    const response = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create folder: ${response.statusText}`);
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error("GDrive: error creating folder:", error);
    throw error;
  }
}

/**
 * Searches for an existing fallback backup file in a specific folder.
 */
export async function searchBackupFile(token: string, folderId: string, fileName: string): Promise<string | null> {
  try {
    const q = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to search backup file: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  } catch (error) {
    console.error("GDrive: error searching backup file:", error);
    throw error;
  }
}

/**
 * Uploads a JSON backup to a specific file (creating it if first-time, or patching the content).
 */
export async function saveBackupFile(
  token: string,
  backupObj: BackupObject,
  folderId: string,
  existingFileId?: string | null
): Promise<{ fileId: string; modifiedTime: string }> {
  try {
    let fileId = existingFileId;

    if (!fileId) {
      // Step 1: Create metadata
      const createResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "marathon_proverbs_backup.json",
          mimeType: "application/json",
          parents: [folderId],
        }),
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create file metadata: ${createResponse.statusText}`);
      }
      const fileMeta = await createResponse.json();
      fileId = fileMeta.id;
    }

    if (!fileId) {
      throw new Error("Could not acquire file ID for backup uploading");
    }

    // Step 2: Upload raw media content (PATCH uploadType=media)
    const uploadResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(backupObj, null, 2),
      }
    );

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload media content: ${uploadResponse.statusText}`);
    }

    // Step 3: Get latest file metadata (to acquire final modified time)
    const metaResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const metaData = await metaResponse.json();
    return {
      fileId,
      modifiedTime: metaData.modifiedTime || new Date().toISOString(),
    };
  } catch (error) {
    console.error("GDrive: error saving backup:", error);
    throw error;
  }
}

/**
 * Downloads backup file JSON content from Google Drive
 */
export async function downloadBackupFile(token: string, fileId: string): Promise<BackupObject> {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download backup content: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("GDrive: error downloading backup file:", error);
    throw error;
  }
}

/**
 * Gets a file's metadata (id and modifiedTime) from Google Drive
 */
export async function getFileMetadata(token: string, fileId: string): Promise<{ fileId: string; modifiedTime: string }> {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get file metadata: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      fileId: data.id,
      modifiedTime: data.modifiedTime,
    };
  } catch (error) {
    console.error("GDrive: error getting file metadata:", error);
    throw error;
  }
}

/**
 * Creates and inserts high-quality table data to a fresh Google Sheet
 */
export async function exportToGoogleSheet(
  token: string,
  folderId: string,
  subscribers: any[],
  days: Record<number, any>,
  sheetTitle: string
): Promise<string> {
  try {
    // Step 1: Create a secure Spreadsheet metadata in the backup folder
    const createResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: sheetTitle,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [folderId],
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create spreadsheet: ${createResponse.statusText}`);
    }

    const spreadsheet = await createResponse.json();
    const spreadsheetId = spreadsheet.id;

    // Step 2: Prepare columns and row values
    // Sort subscribers exactly by their rank: total score desc, then joinedAt asc
    const sortedSubscribers = [...subscribers].sort((a, b) => {
      const scoreA = Object.values(a.solvedDays || {}).reduce((sum: number, s: any) => sum + (s.score || 0), 0);
      const scoreB = Object.values(b.solvedDays || {}).reduce((sum: number, s: any) => sum + (s.score || 0), 0);
      if (scoreB !== scoreA) return (scoreB as number) - (scoreA as number);
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });

    // Derive active day titles
    const activeDays = Object.keys(days)
      .map(Number)
      .sort((a, b) => a - b);

    // Headers
    const headers = [
      "المركز",
      "اسم الفتى المشترك",
      "إجمالي الدرجات",
      "عدد الأيام المكتملة",
      "تاريخ الانضمام",
      ...activeDays.map(d => `اليوم ${d} (${days[d]?.title || `الإصحاح ${d}`})`),
    ];

    // Rows
    const rows = sortedSubscribers.map((sub, idx) => {
      const solvedCount = Object.keys(sub.solvedDays || {}).length;
      const totalScore = Object.values(sub.solvedDays || {}).reduce((sum: number, s: any) => sum + (s.score || 0), 0);
      const formattedDate = new Date(sub.joinedAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });

      const dayScores = activeDays.map(d => {
        const solved = sub.solvedDays?.[d];
        if (!solved) return "لم يحل بعد";
        return `${solved.score} / 3`;
      });

      return [idx + 1, sub.name, totalScore, solvedCount, formattedDate, ...dayScores];
    });

    const bodyValues = [headers, ...rows];

    // Step 3: Populate values using Sheets API API
    const sheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          range: "Sheet1!A1",
          majorDimension: "ROWS",
          values: bodyValues,
        }),
      }
    );

    if (!sheetResponse.ok) {
      throw new Error(`Failed to write values to sheet: ${sheetResponse.statusText}`);
    }

    return spreadsheetId;
  } catch (error) {
    console.error("GDrive: error exporting to sheet:", error);
    throw error;
  }
}
