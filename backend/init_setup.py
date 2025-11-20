"""
初始化脚本 - 用于预下载所有必需的模型和依赖
运行此脚本以避免首次运行时的超时问题
"""
import os
import sys
from dotenv import load_dotenv

def check_env_file():
    """检查 .env 文件是否存在"""
    print("=" * 60)
    print("步骤 1: 检查环境配置")
    print("=" * 60)
    
    if not os.path.exists(".env"):
        print("⚠️  未找到 .env 文件")
        print("📝 请复制 .env.example 为 .env 并填入你的 API Key")
        print("\n示例命令:")
        print("  Windows: copy .env.example .env")
        print("  Linux/Mac: cp .env.example .env")
        return False
    
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    
    if not api_key or api_key == "sk-your-openai-api-key-here":
        print("⚠️  .env 文件存在，但 OPENAI_API_KEY 未正确配置")
        print("📝 请编辑 .env 文件，填入有效的 API Key")
        return False
    
    print("✅ 环境配置检查通过")
    print(f"   - API Key: {api_key[:20]}...")
    print(f"   - Base URL: {os.getenv('OPENAI_BASE_URL', 'default')}")
    print(f"   - Model: {os.getenv('OPENAI_MODEL_NAME', 'gpt-3.5-turbo')}")
    return True

def download_chroma_models():
    """预下载 ChromaDB 的嵌入模型"""
    print("\n" + "=" * 60)
    print("步骤 2: 下载 ChromaDB 嵌入模型")
    print("=" * 60)
    print("正在下载 ONNX MiniLM-L6-v2 模型（约 80MB）...")
    print("这可能需要几分钟，请耐心等待...\n")
    
    try:
        import chromadb
        from chromadb.config import Settings
        
        # 创建临时客户端以触发模型下载
        client = chromadb.Client(Settings(
            persist_directory="./chroma_db",
            is_persistent=True
        ))
        
        # 创建临时集合以触发嵌入函数初始化
        collection = client.get_or_create_collection(name="init_test")
        
        # 添加一个测试文档来触发模型下载
        collection.add(
            documents=["这是一个测试文档，用于触发 ChromaDB 模型下载。"],
            metadatas=[{"type": "test"}],
            ids=["test_init"]
        )
        
        print("✅ ChromaDB 嵌入模型下载完成")
        
        # 清理测试集合
        client.delete_collection("init_test")
        
    except Exception as e:
        print(f"❌ ChromaDB 模型下载失败: {e}")
        print("💡 提示: 如果是网络超时，可以:")
        print("   1. 检查网络连接")
        print("   2. 使用代理")
        print("   3. 手动下载模型文件")
        return False
    
    return True

def test_openai_connection():
    """测试 OpenAI API 连接"""
    print("\n" + "=" * 60)
    print("步骤 3: 测试 LLM 连接")
    print("=" * 60)
    
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage
        
        llm = ChatOpenAI(
            model=os.getenv("OPENAI_MODEL_NAME", "gpt-3.5-turbo"),
            temperature=0.7,
            base_url=os.getenv("OPENAI_BASE_URL"),
            api_key=os.getenv("OPENAI_API_KEY"),
            timeout=30
        )
        
        print("正在发送测试请求...")
        response = llm.invoke([HumanMessage(content="Hello, say 'API Connected!'")])
        
        print("✅ LLM 连接成功")
        print(f"   响应: {response.content[:100]}...")
        
    except Exception as e:
        print(f"❌ LLM 连接失败: {e}")
        print("💡 请检查:")
        print("   1. API Key 是否正确")
        print("   2. Base URL 是否可访问")
        print("   3. 网络连接是否正常")
        return False
    
    return True

def check_dependencies():
    """检查所有依赖是否已安装"""
    print("\n" + "=" * 60)
    print("步骤 4: 检查依赖包")
    print("=" * 60)
    
    required_packages = [
        "langgraph",
        "langchain",
        "langchain_openai",
        "chromadb",
        "chainlit",
        "openai",
        "dotenv"
    ]
    
    missing = []
    for package in required_packages:
        try:
            __import__(package.replace("-", "_"))
            print(f"✅ {package}")
        except ImportError:
            print(f"❌ {package} (未安装)")
            missing.append(package)
    
    if missing:
        print(f"\n⚠️  缺少依赖: {', '.join(missing)}")
        print("请运行: pip install -r requirements.txt")
        return False
    
    print("\n✅ 所有依赖包已安装")
    return True

def main():
    print("\n" + "🚀 " * 15)
    print("AI 小说写作框架 - 初始化程序")
    print("🚀 " * 15 + "\n")
    
    # 步骤 1: 检查依赖
    if not check_dependencies():
        print("\n❌ 初始化失败: 请先安装依赖")
        sys.exit(1)
    
    # 步骤 2: 检查环境变量
    if not check_env_file():
        print("\n❌ 初始化失败: 请配置 .env 文件")
        sys.exit(1)
    
    # 步骤 3: 下载 ChromaDB 模型
    if not download_chroma_models():
        print("\n⚠️  ChromaDB 模型下载失败，但可以继续")
        print("   首次运行时可能会重试下载")
    
    # 步骤 4: 测试 LLM 连接
    if not test_openai_connection():
        print("\n⚠️  LLM 连接测试失败")
        print("   请检查配置后再运行主程序")
    
    print("\n" + "=" * 60)
    print("✅ 初始化完成！")
    print("=" * 60)
    print("\n现在可以运行主程序:")
    print("  chainlit run app.py -w")
    print("\n" + "🎉 " * 15 + "\n")

if __name__ == "__main__":
    main()
