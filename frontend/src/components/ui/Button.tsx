import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { buttonBase, buttonOptions } from "../../design-system/button"

import { cn } from "@/lib/utils"

const buttonVariants = cva(buttonBase, buttonOptions)

function Button({
  className,
  variant = "default",
  size = "default",
  color: _color,
  loading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & {
  color?: string
  /** The action is running: the button shows a spinner, ignores further clicks and is announced as busy. */
  loading?: boolean
  /** What the button says while loading ("Saving…"); keeps its normal label when omitted. */
  loadingLabel?: string
}) {
  // Legacy color prop remains accepted; all action colors come from theme tokens.
  void _color;
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
      {loading && loadingLabel ? loadingLabel : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
