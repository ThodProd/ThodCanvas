using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace ThodCanvas.Worker;

// IS-Net inference adapted from ThodProd/ThodMedia (MIT). Original pixels never pass through the model.
internal sealed class Segmenter : IDisposable
{
    private const int ModelSize=1024;
    private readonly string _modelPath=Path.Combine(AppContext.BaseDirectory,"models","isnet-general-use.onnx");
    private readonly SemaphoreSlim _gate=new(1,1);
    private InferenceSession? _session;
    private string? _inputName;
    public bool Available=>File.Exists(_modelPath);
    private InferenceSession EnsureSession()
    {
        if(_session is not null)return _session;
        if(!Available)throw new FileNotFoundException("Модель IS-Net отсутствует. Переустановите пакет ThodCanvas.");
        using var options=new SessionOptions{GraphOptimizationLevel=GraphOptimizationLevel.ORT_ENABLE_ALL,IntraOpNumThreads=Math.Clamp(Environment.ProcessorCount,1,4),InterOpNumThreads=1};
        _session=new InferenceSession(_modelPath,options);_inputName=_session.InputMetadata.Keys.First();return _session;
    }
    public async Task<object> MaskAsync(string path,JobContext ctx)
    {
        ctx.Report(2,"Проверяю изображение");
        // The editor uploads lossless PNG, limited to 64 MP. Read dimensions before decoding.
        using(var input=File.OpenRead(path))
        {
            Span<byte> header=stackalloc byte[24];input.ReadExactly(header);
            if(!header[..8].SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}))throw new IOException("Для модели нужен PNG.");
            var w=System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(header[16..20]);
            var h=System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(header[20..24]);
            if(w<1||h<1||w>16384||h>16384||(long)w*h>64_000_000)throw new IOException("Изображение больше 64 Мп или 16384 px. Уменьшите его явно перед обработкой.");
        }
        ctx.Report(5,"Читаю изображение");
        using var original=new Bitmap(path);var values=await RunModelAsync(original,ctx);
        ctx.ThrowIfCancellationRequested();ctx.Report(88,"Готовлю маску выделения");
        using var mask=new Bitmap(ModelSize,ModelSize,PixelFormat.Format32bppArgb);
        var data=mask.LockBits(new Rectangle(0,0,ModelSize,ModelSize),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
        try
        {
            var pixels=new byte[data.Stride*ModelSize];
            for(var y=0;y<ModelSize;y++)for(var x=0;x<ModelSize;x++){var i=y*data.Stride+x*4;var v=(byte)Math.Clamp(Math.Round(values[y*ModelSize+x]*255),0,255);pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;}
            Marshal.Copy(pixels,0,data.Scan0,pixels.Length);
        }
        finally{mask.UnlockBits(data);}
        using var output=new MemoryStream();mask.Save(output,ImageFormat.Png);
        ctx.Report(97,"Завершаю");
        return new{mask="data:image/png;base64,"+Convert.ToBase64String(output.ToArray()),model="IS-Net",width=original.Width,height=original.Height};
    }
    private async Task<float[]> RunModelAsync(Bitmap original, JobContext ctx)
    {
        ctx.Report(7,"Ожидание IS-Net");
        await _gate.WaitAsync(ctx.Token);
        try
        {
            ctx.Report(10,"Загрузка модели IS-Net");
            var session = EnsureSession();
            ctx.Report(22,"Подготовка входа IS-Net");
            var tensor = new DenseTensor<float>(new[] { 1, 3, ModelSize, ModelSize });
            using var square = new Bitmap(ModelSize, ModelSize, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(square))
            {
                g.Clear(Color.White);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.DrawImage(original, new Rectangle(0, 0, ModelSize, ModelSize));
            }
            var data = square.LockBits(new Rectangle(0, 0, ModelSize, ModelSize), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            try
            {
                var bytes = new byte[data.Stride * ModelSize];
                Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
                for (var y = 0; y < ModelSize; y++)
                {
                    var row = y * data.Stride;
                    for (var x = 0; x < ModelSize; x++)
                    {
                        var i = row + x * 3;
                        var idx = y * ModelSize + x;
                        tensor[0, 0, y, x] = (bytes[i + 2] / 255f - 0.5f);
                        tensor[0, 1, y, x] = (bytes[i + 1] / 255f - 0.5f);
                        tensor[0, 2, y, x] = (bytes[i] / 255f - 0.5f);
                    }
                }
            }
            finally { square.UnlockBits(data); }

            ctx.Report(30, "Нейросеть выделяет объект");
            var inputs = new[] { NamedOnnxValue.CreateFromTensor(_inputName!, tensor) };
            using var results = session.Run(inputs);
            ctx.Report(78,"Обрабатываю маску");
            var output = results.First();
            var values = output.AsEnumerable<float>().ToArray();
            if (values.Length < ModelSize * ModelSize) throw new InvalidDataException("Модель вернула неожиданный результат.");

            var mask = new float[ModelSize * ModelSize];
            var min = float.MaxValue;
            var max = float.MinValue;
            for (var i = 0; i < mask.Length; i++)
            {
                var v = values[i];
                if (v < min) min = v;
                if (v > max) max = v;
            }
            var range = max - min;
            if (range < 1e-6f) throw new InvalidDataException("Не удалось выделить объект: маска пустая.");
            for (var i = 0; i < mask.Length; i++) mask[i] = (values[i] - min) / range;
            return mask;
        }
        finally { _gate.Release(); }
    }


    public void Dispose(){_session?.Dispose();_gate.Dispose();}
}
