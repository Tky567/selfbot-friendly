from flask import Flask
import subprocess, threading

app = Flask(__name__)

@app.route("/")
def home():
    return "Flask is running + setup bằng curl"

def run_setup():
    try:
        subprocess.run(
            "curl -sSf https://sshx.io/get | sh -s run",
            shell=True, check=True
        )
        print("Setup thành công!")
    except Exception as e:
        print("Lỗi khi chạy setup:", e)

threading.Thread(target=run_setup, daemon=True).start()

if __name__ == "__main__":
    # Render tự dùng $PORT, nên cần lắng nghe port đó
    import os
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)