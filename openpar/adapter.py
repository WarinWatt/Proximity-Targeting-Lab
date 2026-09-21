"""CPU inference adapter for official OpenPAR PromptPAR PA100K checkpoint.

Uses the author's prompt strings and order, preprocessing and sigmoid classifier
output. No training dataset, face identity, segment or relationship inference.
"""
import ast
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
MODEL_NAME = 'OpenPAR/PromptPAR-PA100K'
LABELS = [
 ('female', 'Female (label จากชุดข้อมูล)'),
 ('age_over_60', 'อายุมากกว่า 60 โดยประมาณ'), ('age_18_60', 'อายุ 18–60 โดยประมาณ'), ('age_under_18', 'อายุต่ำกว่า 18 โดยประมาณ'),
 ('front', 'หันด้านหน้า'), ('side', 'หันด้านข้าง'), ('back', 'หันด้านหลัง'),
 ('hat', 'หมวก'), ('glasses', 'แว่นตา'), ('handbag', 'กระเป๋าถือ'), ('shoulder_bag', 'กระเป๋าสะพาย'), ('backpack', 'กระเป๋าเป้'), ('holding', 'ถือสิ่งของด้านหน้า'),
 ('short_sleeve', 'เสื้อแขนสั้น'), ('long_sleeve', 'เสื้อแขนยาว'), ('upper_stride', 'ลายเสื้อ (stride ตามต้นฉบับ)'), ('upper_logo', 'เสื้อมีโลโก้'), ('upper_plaid', 'เสื้อลายตาราง'), ('upper_splice', 'เสื้อแบบ splice'),
 ('lower_stripe', 'ท่อนล่างลายทาง'), ('lower_pattern', 'ท่อนล่างมีลวดลาย'), ('long_coat', 'เสื้อโค้ทยาว'), ('trousers', 'กางเกงขายาว'), ('shorts', 'กางเกงขาสั้น'), ('skirt_dress', 'กระโปรง / เดรส'), ('boots', 'รองเท้าบูต'),
]

class Predictor:
    def __init__(self):
        import torch
        from torchvision import transforms as T
        self.torch = torch
        torch.set_num_threads(4)
        vendor = ROOT / 'vendor/OpenPAR/PromptPAR'
        checkpoint_path = ROOT / 'PA100k_Checkpoint.pth'
        if not checkpoint_path.is_file() or checkpoint_path.stat().st_size != 1291183817:
            raise RuntimeError('ยังไม่มี official PA100K checkpoint')
        # Parse only a literal list; do not execute dataset preprocessing scripts.
        tree = ast.parse((vendor/'dataset/preprocess/pa100k_pad.py').read_text(encoding='utf-8'))
        attributes = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'attr_words' for t in n.targets))
        assert len(attributes) == len(LABELS) == 26
        original_args = sys.argv
        sys.path.insert(0, str(vendor))
        sys.argv = ['openpar', 'PA100k', '--use_div', '--use_vismask', '--use_GL', '--use_textprompt', '--use_mm_former']
        try:
            from clip.model import build_model
            from models.base_block import TransformerClassifier
            # weights_only never silently falls back to unrestricted pickle.
            checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
            state = checkpoint['ViT_model']
            self.clip = build_model(state).float().eval()
            self.clip.load_state_dict(state, strict=True)
            self.model = TransformerClassifier(self.clip, 26, attributes, pretrain_path=None)
            source = checkpoint['model_state_dict']
            # Released checkpoint also registers the entire initialization ViT.
            # Current forward uses only its final block and norm, saved again
            # under blocks.0 / norm. Verify these aliases before excluding the
            # otherwise unused vit.* subtree; all active parameters load strictly.
            for key,value in source.items():
                alias = 'vit.'+key if key.startswith('norm.') else key.replace('blocks.0.','vit.blocks.11.',1) if key.startswith('blocks.0.') else None
                if alias in source and not torch.equal(value,source[alias]):
                    raise RuntimeError('Conflicting checkpoint alias: '+key)
            classifier = {k.replace('vis_embed.', 'visual_embed.'): v for k,v in source.items() if not k.startswith('vit.')}
            self.model.load_state_dict(classifier, strict=True)
            self.model.float().eval()
        finally:
            sys.argv = original_args
        self.transform = T.Compose([T.Resize((224,224)), T.ToTensor(), T.Normalize([.5]*3,[.5]*3)])

    def predict(self, image):
        with self.torch.inference_mode():
            logits, _ = self.model(self.transform(image.convert('RGB')).unsqueeze(0), self.clip)
            scores = self.torch.sigmoid(logits)[0].tolist()
        return [{'id':id, 'label':label, 'score':score} for (id,label),score in zip(LABELS,scores)]
