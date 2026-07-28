"use client";

import "@assistant-ui/react-markdown/styles/dot.css";
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";
import { cn } from "@/lib/utils";

const components = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1 className={cn("mt-6 mb-2 text-2xl font-semibold first:mt-0", className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("mt-5 mb-2 text-xl font-semibold first:mt-0", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mt-4 mb-1.5 text-lg font-semibold first:mt-0", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("my-3 leading-7 first:mt-0 last:mb-0", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("my-3 ml-5 list-disc space-y-1", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("my-3 ml-5 list-decimal space-y-1", className)} {...props} />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("my-3 border-l-2 border-neutral-300 pl-4 text-neutral-600", className)}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a className={cn("underline decoration-neutral-300 underline-offset-3 hover:decoration-neutral-700", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-neutral-200">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th className={cn("bg-neutral-50 px-3 py-2 text-left font-medium", className)} {...props} />
  ),
  td: ({ className, ...props }) => (
    <td className={cn("border-t border-neutral-200 px-3 py-2 align-top", className)} {...props} />
  ),
  pre: ({ className, ...props }) => (
    <pre className={cn("my-3 overflow-x-auto rounded-xl bg-neutral-950 p-4 text-[13px] leading-6 text-neutral-100", className)} {...props} />
  ),
  code: function Code({ className, ...props }) {
    const block = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !block && "rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.88em]",
          className
        )}
        {...props}
      />
    );
  }
});

function MarkdownTextImpl() {
  return <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} components={components} defer />;
}

export const MarkdownText = memo(MarkdownTextImpl);
