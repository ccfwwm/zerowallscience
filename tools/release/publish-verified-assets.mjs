// Keep promotion behind public verification; injected operations permit failure tests.
export async function publishVerifiedAssets({ assets, upload, verifyVersion, verifyArchive, promote, verifyLatest }) {
  for (const asset of assets) await upload(asset)
  await verifyVersion()
  await verifyArchive()
  await promote()
  await verifyLatest()
}
