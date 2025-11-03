// Example Typst document
#set page(paper: "a4")
#set text(font: "Linux Libertine", size: 11pt)

= Welcome to WriteBot

This is a sample Typst document to demonstrate the automated PDF compilation workflow.

== Features

- Automatic compilation of `.typ` files to PDF
- GitHub Actions workflow integration
- Directory listing for easy PDF access

== Getting Started

Write your Typst documents in the `/source` folder, and the GitHub Actions workflow will automatically compile them to PDFs in the `/pdf` folder.

#pagebreak()

== Example Code

```python
def hello_world():
    print("Hello from WriteBot!")
```

== Conclusion

This workflow makes it easy to maintain and share PDF documents generated from Typst source files.
