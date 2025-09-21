local json = require("dkjson")

local function execute()
    -- Open and read code file
    local f_code = io.open("code.lua", "r")
    if not f_code then
        io.stderr:write(json.encode({error = "Could not open code.lua"}))
        os.exit(1)
    end
    local code = f_code:read("*a")
    f_code:close()

    -- Open and read args file
    local f_args = io.open("args.json", "r")
    if not f_args then
        io.stderr:write(json.encode({error = "Could not open args.json"}))
        os.exit(1)
    end
    local args_json_str = f_args:read("*a")
    f_args:close()

    -- Decode arguments
    local args, pos, err = json.decode(args_json_str)
    if err then
        io.stderr:write(json.encode({error = "JSON decoding error for args: " .. err}))
        os.exit(1)
    end

    -- Wrap code in a function
    local func_str = "return function(...)\n" .. code .. "\nend"
    local func, load_err = load(func_str)
    if not func then
        io.stderr:write(json.encode({error = "Syntax error: " .. load_err}))
        os.exit(1)
    end

    -- Execute the function with protected call
    local status, result = pcall(func(), table.unpack(args))

    if status then
        -- Encode and print result
        local result_json, encode_err = json.encode({result = result})
        if encode_err then
             io.stderr:write(json.encode({error = "JSON encoding error for result: " .. encode_err}))
             os.exit(1)
        end
        print(result_json)
    else
        -- Print error from execution
        io.stderr:write(json.encode({error = "Execution error: " .. tostring(result)}))
        os.exit(1)
    end
end

execute()
