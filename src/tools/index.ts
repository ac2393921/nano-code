import { readFile } from "./readFile";
import { writeFile } from "./writeFile";
import { editFile } from "./editFile";
import { execCommand } from "./execCommand";

export const allTools = [
    readFile,
    writeFile,
    editFile,
    execCommand,
]