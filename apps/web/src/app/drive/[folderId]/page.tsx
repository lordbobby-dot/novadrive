import { DriveView } from "@/components/drive/drive-view";

export default async function DriveFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  return <DriveView folderId={folderId} />;
}
