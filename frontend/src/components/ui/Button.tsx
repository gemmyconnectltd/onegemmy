import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { buttonBase, buttonOptions } from "../../design-system/button"

import { cn } from "@/lib/utils"

const buttonVariants = cva(buttonBase, buttonOptions)

function Button({
  className,
  variant = "default",
  size = "default",
  color: _color,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { color?: string }) {
  // Legacy color prop remains accepted; all action colors come from theme tokens.
  void _color;
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
