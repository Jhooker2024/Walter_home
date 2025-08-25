"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef((props, ref) => {
  const { className, align = "center", sideOffset = 4, ...rest } = props

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className="z-50 w-72 rounded-md border border-gray-200 bg-white p-4 text-black shadow-md outline-none"
        {...rest}
      />
    </PopoverPrimitive.Portal>
  )
})

PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent }
