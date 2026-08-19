import { toast as sonnerToast } from "sonner"

/**
 * Compatibility wrapper for sonner to match shadcn/ui toast interface.
 */
export function useToast() {
  return {
    toast: ({ title, description, variant }: {
      title?: string,
      description?: string,
      variant?: "default" | "destructive"
    }) => {
      const options = {
        description,
      }

      if (variant === "destructive") {
        sonnerToast.error(title, options)
      } else {
        sonnerToast.success(title, options)
      }
    },
  }
}
