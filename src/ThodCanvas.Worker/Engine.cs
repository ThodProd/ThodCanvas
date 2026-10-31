using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Win32;

namespace ThodCanvas.Worker;

internal sealed class Engine : IAsyncDisposable
{
    private sealed class Asset(string path) { public string Path {get;}=path; public bool Ready; public object Gate {get;}=new(); }
    private readonly ConcurrentDictionary<string,Asset> _assets=new();
    private readonly string _root;
    private readonly Segmenter _model=new();
    private readonly JobManager _jobs;
    private int _disposed;
    public Engine(string dataDir)
    {
        _root=Directory.CreateDirectory(Path.Combine(dataDir,"cache","editor",Guid.NewGuid().ToString("N"))).FullName;
        _jobs=new JobManager(RunAsync);
    }
    public Task<object> HandleAsync(string method,JsonElement? parameters,CancellationToken ct)
    {
        var p=new Params(parameters);
        switch(method)
        {
            case "environment": return Task.FromResult<object>(new {version="1.1.0",model="IS-Net",modelFound=_model.Available});
            case "upload.begin":
                if(_assets.Count>=32)throw new IOException("Слишком много временных файлов. Закройте редактор и откройте снова.");
                var id=Guid.NewGuid().ToString("N");var path=Path.Combine(_root,id+".data");
                using(File.Create(path)){} _assets[id]=new Asset(path);return Task.FromResult<object>(new{id});
            case "upload.write":
                var asset=Find(p.RequiredString("id"));
                var bytes=Convert.FromBase64String(p.RequiredString("base64"));
                if(bytes.Length>1024*1024)throw new IOException("Слишком большой блок.");
                lock(asset.Gate)
                {
                    if(asset.Ready)throw new IOException("Файл уже завершён.");
                    using var stream=new FileStream(asset.Path,FileMode.Open,FileAccess.Write,FileShare.None);
                    if(stream.Length!=p.Long("offset",-1)||stream.Length+bytes.Length>512L*1024*1024)throw new IOException("Неверный порядок блоков или файл больше 512 МБ.");
                    stream.Position=stream.Length;stream.Write(bytes);return Task.FromResult<object>(new{received=stream.Position});
                }
            case "upload.finish":
                var finished=Find(p.RequiredString("id"));lock(finished.Gate){finished.Ready=true;}return Task.FromResult<object>(new{ok=true});
            case "upload.release":
                if(_assets.TryRemove(p.RequiredString("id"),out var removed)){lock(removed.Gate){File.Delete(removed.Path);}}return Task.FromResult<object>(true);
            case "job.start":
                var nested=parameters!.Value.GetProperty("params").Clone();var job=_jobs.Start(p.RequiredString("kind"),nested);return Task.FromResult<object>(new{jobId=job.Id});
            case "job.status":return Task.FromResult(_jobs.Status(p.RequiredString("id")));
            case "job.cancel":return Task.FromResult(_jobs.Cancel(p.RequiredString("id")));
            default:throw new RpcException(-32601,"Неизвестная команда редактора.");
        }
    }
    private Asset Find(string id)=>_assets.TryGetValue(id,out var asset)?asset:throw new IOException("Временный файл не найден.");
    private async Task<object> RunAsync(Job job,JobContext ctx)
    {
        var p=new Params(job.Params);var asset=Find(p.RequiredString("id"));
        if(!asset.Ready)throw new IOException("Файл ещё загружается.");
        if(job.Kind=="mask")return await _model.MaskAsync(asset.Path,ctx);
        var project=p.String("type")=="project";
        var name=Path.GetFileNameWithoutExtension(p.String("name")??"Изображение")+(project?".thodcanvas":".png");
        ctx.Report(20,"Выберите место сохранения");
        var completion=new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread=new Thread(()=>
        {
            try
            {
                var dialog=new SaveFileDialog{Title=project?"Сохранить проект со слоями":"Экспорт PNG без потерь",FileName=name,DefaultExt=project?".thodcanvas":".png",Filter=project?"Проект ThodCanvas|*.thodcanvas":"PNG с прозрачностью|*.png",OverwritePrompt=true,AddExtension=true};
                completion.SetResult(dialog.ShowDialog()==true?dialog.FileName:null);
            }
            catch(Exception e){completion.SetException(e);}
        }){IsBackground=true};thread.SetApartmentState(ApartmentState.STA);thread.Start();
        var destination=await completion.Task;
        if(destination is null)return new{canceled=true};
        ctx.ThrowIfCancellationRequested();ctx.Report(75,"Сохраняю файл");
        var temp=Path.Combine(Path.GetDirectoryName(destination)!,".thodcanvas-"+Guid.NewGuid().ToString("N")+".tmp");
        try
        {
            File.Copy(asset.Path,temp,false);ctx.ThrowIfCancellationRequested();
            if(File.Exists(destination))File.Replace(temp,destination,null);else File.Move(temp,destination);
            return new{canceled=false,path=destination,size=new FileInfo(destination).Length};
        }
        finally{if(File.Exists(temp))File.Delete(temp);}
    }
    public async ValueTask DisposeAsync()
    {
        if(Interlocked.Exchange(ref _disposed,1)!=0)return;
        await _jobs.DisposeAsync();_model.Dispose();
        // Only this process's freshly created cache directory; never a user-selected path.
        try{Directory.Delete(_root,true);}catch(IOException){}
    }
    public Task ShutdownAsync()=>DisposeAsync().AsTask();
}
