import { useEffect, type ImgHTMLAttributes } from "react";

import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";

interface VisualAssetImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  assetId: string;
  title: string;
  sourceMessageId?: string;
  registerAsVisual?: boolean;
}

export function VisualAssetImage({
  assetId,
  title,
  sourceMessageId,
  registerAsVisual = true,
  src,
  ...props
}: VisualAssetImageProps) {
  const { registerAsset, openAsset } = useVisualWorkspace();

  useEffect(() => {
    if (!registerAsVisual || !src) return;
    registerAsset({
      id: assetId,
      kind: "image",
      title,
      sourceMessageId,
      createdAt: Date.now(),
      url: src,
    });
  }, [assetId, registerAsset, registerAsVisual, sourceMessageId, src, title]);

  return (
    <img
      src={src}
      {...props}
      onDoubleClick={(event) => {
        props.onDoubleClick?.(event);
        openAsset(assetId);
      }}
    />
  );
}
