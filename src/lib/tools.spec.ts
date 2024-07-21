import { parseToolsConfig } from "./tools";

describe('tools', () => {
  const config = `

read_file:
  description: Read the contents of a file
  parameters:
    file_path: The path to the file to read
  command: "cat {file_path}"

read_web_page:
  description: Read the contents of a web page
  parameters:
    url: The URL of the web page to read
  command: "elinks {url}"

search_web:
  description: Search the web for a given query
  parameters:
    query: "The search query"
  command: "googler --np {query}"
`

  it('should unpaack a YAML tools config into an OpenAI tools config', () => {

    expect(parseToolsConfig(config).api).toEqual(
      [

        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read the contents of a file",
            parameters: {
              type: "object",
              properties: {
                file_path: {
                  type: "string",
                  description: "The path to the file to read",
                },
              },
              required: ["file_path"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "read_web_page",
            description: "Read the contents of a web page",
            parameters: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "The URL of the web page to read",
                },
              },
              required: ["url"],
            },
          }
        },
        {
          type: "function",
          function: {
            name: "search_web",
            description: "Search the web for a given query",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query",
                },
              },
              required: ["query"],
            },
          }
        }
      ]
    )

  });
});