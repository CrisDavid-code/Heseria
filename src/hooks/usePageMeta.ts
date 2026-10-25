import { useEffect } from "react";

/**
 * Per-page metadata (section 61 of the spec).
 * Sets document.title and the description meta tag, restoring them on unmount.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} · Heseria` : "Heseria";

    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = tag?.content;
    if (description) {
      if (!tag) {
        tag = document.createElement("meta");
        tag.name = "description";
        document.head.appendChild(tag);
      }
      tag.content = description;
    }

    return () => {
      document.title = previousTitle;
      if (description && tag && previousDescription !== undefined) {
        tag.content = previousDescription;
      }
    };
  }, [title, description]);
}
