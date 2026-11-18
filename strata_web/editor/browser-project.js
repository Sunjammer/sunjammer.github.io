const encoder = new TextEncoder();
const magic = encoder.encode("BLACKHEART_STRATA_PROJECT\0");
const maxProjectCharacters = 16 * 1024 * 1024;
const maxImages = 512;
const maxManifestBytes = 128 * 1024 * 1024;
const maxAssetBytes = 256 * 1024 * 1024;
const maxFileBytes = 300 * 1024 * 1024;
const maxAssetNameCharacters = 1024;
const maxAssetTypeCharacters = 256;

export function projectImageIds(state) {
  if (typeof state !== "string" || state.length > maxProjectCharacters)
    throw new Error("Browser project exceeds the 16 MiB JSON limit.");
  const project = JSON.parse(state);
  if (!Array.isArray(project.images) || project.images.length > maxImages)
    throw new Error("Browser project has an invalid image list.");
  const ids = new Set();
  for (const image of project.images) {
    const id = image?.id;
    if (!Number.isInteger(id) || id < 0 || id > 0xffff_ffff || ids.has(id))
      throw new Error("Browser project has invalid or duplicate image IDs.");
    ids.add(id);
  }
  return ids;
}

export function normalizeName(name) {
  const normalized = String(name ?? "").trim();
  if (!normalized) throw new Error("Enter a project name.");
  if (normalized.length > 128)
    throw new Error("Project names must be 128 characters or fewer.");
  return normalized;
}

export function encodeBrowserProjectFile(name, state, assets) {
  name = normalizeName(name);
  const expectedIds = projectImageIds(state);
  if (!Array.isArray(assets) || assets.length !== expectedIds.size)
    throw new Error("Image metadata and assets do not match.");
  let assetBytes = 0;
  const seen = new Set();
  const metadata = assets.map((asset) => {
    if (!asset || typeof asset !== "object")
      throw new Error("Image metadata and assets do not match.");
    const { id, name: assetName, blob } = asset;
    const savedName = String(assetName || "Saved image");
    if (
      !expectedIds.has(id) ||
      seen.has(id) ||
      !(blob instanceof Blob) ||
      savedName.length > maxAssetNameCharacters ||
      blob.type.length > maxAssetTypeCharacters
    )
      throw new Error("Image metadata and assets do not match.");
    seen.add(id);
    assetBytes += blob.size;
    if (assetBytes > maxAssetBytes)
      throw new Error("Project image assets exceed 256 MiB.");
    return {
      id,
      name: savedName,
      type: blob.type,
      size: blob.size,
    };
  });
  const manifestBytes = encoder.encode(
    JSON.stringify({
      format: "blackheart.strata-browser-file",
      schemaVersion: 1,
      name,
      state,
      assets: metadata,
    }),
  );
  if (manifestBytes.length > maxManifestBytes)
    throw new Error("Browser project manifest exceeds 128 MiB.");
  const header = new Uint8Array(magic.length + 4);
  header.set(magic);
  new DataView(header.buffer).setUint32(
    magic.length,
    manifestBytes.length,
    true,
  );
  const file = new Blob(
    [header, manifestBytes, ...assets.map(({ blob }) => blob)],
    {
      type: "application/x-blackheart-strata-project",
    },
  );
  if (file.size > maxFileBytes)
    throw new Error("Browser project file exceeds 300 MiB.");
  return file;
}

export async function decodeBrowserProjectFile(file) {
  if (!(file instanceof Blob)) throw new Error("Choose a Strata project file.");
  if (file.size > maxFileBytes)
    throw new Error("Browser project file exceeds 300 MiB.");
  const headerSize = magic.length + 4;
  if (file.size < headerSize)
    throw new Error("The project file is incomplete.");
  const header = new Uint8Array(await file.slice(0, headerSize).arrayBuffer());
  if (!magic.every((byte, index) => header[index] === byte))
    throw new Error("This is not a Strata browser project file.");
  const manifestLength = new DataView(header.buffer).getUint32(
    magic.length,
    true,
  );
  const manifestEnd = headerSize + manifestLength;
  if (manifestEnd > file.size || manifestLength > maxManifestBytes)
    throw new Error("The project file manifest is invalid.");
  let manifest;
  try {
    manifest = JSON.parse(await file.slice(headerSize, manifestEnd).text());
  } catch {
    throw new Error("The project file manifest is invalid.");
  }
  if (
    manifest?.format !== "blackheart.strata-browser-file" ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.state !== "string" ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length > maxImages
  )
    throw new Error("The project file manifest is unsupported or invalid.");
  const expectedIds = projectImageIds(manifest.state);
  const seen = new Set();
  let offset = manifestEnd;
  let assetBytes = 0;
  const assets = manifest.assets.map((asset) => {
    if (
      !expectedIds.has(asset?.id) ||
      seen.has(asset.id) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 0 ||
      typeof asset.name !== "string" ||
      asset.name.length > maxAssetNameCharacters ||
      typeof asset.type !== "string" ||
      asset.type.length > maxAssetTypeCharacters
    )
      throw new Error("The project file image manifest is invalid.");
    seen.add(asset.id);
    assetBytes += asset.size;
    if (assetBytes > maxAssetBytes || offset + asset.size > file.size)
      throw new Error("The project file image data is invalid.");
    const blob = file.slice(offset, offset + asset.size, asset.type);
    offset += asset.size;
    return { id: asset.id, name: asset.name, blob };
  });
  if (seen.size !== expectedIds.size || offset !== file.size)
    throw new Error(
      "The project file image data is incomplete or has trailing bytes.",
    );
  return {
    name: normalizeName(manifest.name),
    state: manifest.state,
    assets,
  };
}

export function beginBrowserProjectSave(name) {
  name = normalizeName(name);
  const filename = `${name.replace(/[\\/:*?"<>|]/g, "-")}.strata`;
  if (typeof globalThis.showSaveFilePicker !== "function")
    return Promise.resolve({ name, filename, handle: null });
  return globalThis
    .showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "Strata browser project",
          accept: {
            "application/x-blackheart-strata-project": [".strata"],
          },
        },
      ],
    })
    .then(
      (handle) => ({ name, filename, handle }),
      (error) =>
        error?.name === "AbortError" ? null : { name, filename, error },
    );
}

export async function saveBrowserProjectFile(destination, state, assets) {
  if (!destination) return null;
  if (destination.error) throw destination.error;
  const blob = encodeBrowserProjectFile(destination.name, state, assets);
  if (destination.handle) {
    const writable = await destination.handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    return "saved";
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = destination.filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return "download";
}

export async function openBrowserProjectFile(fileInput) {
  let file;
  if (typeof globalThis.showOpenFilePicker === "function") {
    let handles;
    try {
      handles = await globalThis.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Strata browser project",
            accept: {
              "application/x-blackheart-strata-project": [".strata"],
            },
          },
        ],
      });
    } catch (error) {
      if (error?.name === "AbortError") return null;
      throw error;
    }
    file = await handles[0].getFile();
  } else {
    file = await chooseFallbackFile(fileInput);
    if (!file) return null;
  }
  return decodeBrowserProjectFile(file);
}

function chooseFallbackFile(input) {
  return new Promise((resolve, reject) => {
    input.value = "";
    let settled = false;
    let focusTimer = 0;
    const cleanup = () => {
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener("focus", focused);
      input.removeEventListener("change", changed);
      input.removeEventListener("cancel", canceled);
    };
    const finish = (file = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };
    const focused = () => {
      focusTimer = setTimeout(() => finish(input.files?.[0] ?? null), 1000);
    };
    const changed = () => finish(input.files?.[0] ?? null);
    const canceled = () => finish();
    input.addEventListener("change", changed, { once: true });
    input.addEventListener("cancel", canceled, { once: true });
    window.addEventListener("focus", focused, { once: true });
    try {
      input.click();
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}
