import subprocess
import tempfile
import os
from enum import Enum
import ctypes
import json
from typing import Optional, Any
import numpy as np
import pandas as pd

class Language(str, Enum):
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    LUA = "lua"
    PHP = "php"
    C = "c"

class CodeExecutor:
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp()
        self._init_lua()
    
    def _init_lua(self):
        """Initialise Lua runtime si disponible"""
        try:
            import lupa
            self.lua = lupa.LuaRuntime(unpack_returned_tuples=True)
        except ImportError:
            self.lua = None
            print("Lupa n'est pas installé. L'exécution Lua ne sera pas disponible.")

    def cleanup(self):
        """Nettoie les fichiers temporaires"""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    async def execute_python(self, code: str, args: list) -> Any:
        """Exécute du code Python"""
        globals_dict = {
            '__builtins__': __builtins__,
            'np': np,
            'pd': pd,
            'args': args
        }
        locals_dict = {}
        
        wrapped_code = f"""
def NOUVELLE_FONCTION(*args):
{code}
result = NOUVELLE_FONCTION(*args)
"""
        exec(wrapped_code, globals_dict, locals_dict)
        return locals_dict.get('result', None)

    async def execute_javascript(self, code: str, args: list) -> Any:
        """Exécute du code JavaScript via Node.js"""
        try:
            # Créer un fichier temporaire pour le code JS
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, dir=self.temp_dir) as f:
                wrapped_code = f"""
                function NOUVELLE_FONCTION(...args) {{
                    {code}
                }}
                console.log(JSON.stringify(NOUVELLE_FONCTION(...{args})));
                """
                f.write(wrapped_code)
                js_file = f.name

            # Exécuter avec Node.js
            result = subprocess.run(
                ['node', js_file],
                capture_output=True,
                text=True,
                check=True
            )
            
            # Parser la sortie JSON
            import json
            return json.loads(result.stdout)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Erreur JavaScript: {e.stderr}")
        except Exception as e:
            raise RuntimeError(f"Erreur lors de l'exécution JavaScript: {str(e)}")
        finally:
            # Nettoyage
            if os.path.exists(js_file):
                os.remove(js_file)

    async def execute_lua(self, code: str, args: list) -> Any:
        """Exécute du code Lua"""
        if not self.lua:
            try:
                import lupa
                self.lua = lupa.LuaRuntime(unpack_returned_tuples=True)
            except ImportError:
                raise RuntimeError("Lupa n'est pas installé. Impossible d'exécuter du code Lua.")

        try:
            # Préparer le code Lua
            wrapped_code = f"""
            function NOUVELLE_FONCTION(...)
                {code}
            end
            """
            
            # Exécuter le code
            self.lua.execute(wrapped_code)
            
            # Récupérer la fonction et l'exécuter
            func = self.lua.globals().NOUVELLE_FONCTION
            result = func(*args)
            
            return result
        except Exception as e:
            raise RuntimeError(f"Erreur Lua: {str(e)}")

    async def execute_php(self, code: str, args: list) -> Any:
        """Exécute du code PHP"""
        try:
            # Vérifier si PHP est installé
            try:
                subprocess.run(['php', '--version'], capture_output=True, check=True)
            except (subprocess.CalledProcessError, FileNotFoundError):
                raise RuntimeError("PHP n'est pas installé ou n'est pas accessible dans le PATH")

            # Préparer le code PHP
            args_json = json.dumps(args)
            wrapped_code = f"""
            <?php
            function NOUVELLE_FONCTION(...$args) {{
                {code}
            }}
            
            $args = json_decode('{args_json}', true);
            echo json_encode(NOUVELLE_FONCTION(...$args));
            ?>
            """
            
            # Écrire dans un fichier temporaire
            with tempfile.NamedTemporaryFile(mode='w', suffix='.php', delete=False, dir=self.temp_dir) as f:
                f.write(wrapped_code)
                php_file = f.name

            # Exécuter avec PHP
            result = subprocess.run(
                ['php', php_file],
                capture_output=True,
                text=True,
                check=True
            )
            
            # Parser la sortie JSON
            return json.loads(result.stdout)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Erreur PHP: {e.stderr}")
        except Exception as e:
            raise RuntimeError(f"Erreur lors de l'exécution PHP: {str(e)}")
        finally:
            # Nettoyage
            if os.path.exists(php_file):
                os.remove(php_file)

    async def execute_c(self, code: str, args: list) -> Any:
        """Compile et exécute du code C"""
        try:
            # Préparer le code C avec les arguments
            wrapped_code = f"""
            #include <stdio.h>
            #include <stdlib.h>
            #include <math.h>
            
            double NOUVELLE_FONCTION(double* args, int argc) {{
                {code}
            }}
            
            int main(int argc, char* argv[]) {{
                int n = {len(args)};
                double args[{len(args)}] = {{{','.join(map(str, args))}}};
                double result = NOUVELLE_FONCTION(args, n);
                printf("%f", result);
                return 0;
            }}
            """
            
            # Créer les fichiers temporaires
            with tempfile.NamedTemporaryFile(mode='w', suffix='.c', delete=False, dir=self.temp_dir) as f:
                f.write(wrapped_code)
                c_file = f.name
            
            output_file = os.path.join(self.temp_dir, 'prog')
            if os.name == 'nt':
                output_file += '.exe'
            
            # Compiler le code
            compile_result = subprocess.run(
                ['gcc', c_file, '-o', output_file, '-lm'],
                capture_output=True,
                text=True
            )
            
            if compile_result.returncode != 0:
                raise RuntimeError(f"Erreur de compilation: {compile_result.stderr}")
            
            # Exécuter le programme
            result = subprocess.run(
                [output_file],
                capture_output=True,
                text=True,
                check=True
            )
            
            return float(result.stdout)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Erreur d'exécution C: {e.stderr}")
        except Exception as e:
            raise RuntimeError(f"Erreur lors de l'exécution C: {str(e)}")
        finally:
            # Nettoyage
            for file in [c_file, output_file]:
                if os.path.exists(file):
                    os.remove(file)